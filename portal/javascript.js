let sharedPort = null;
let radioRowCount = 0;
const MAX_RADIO_STATIONS = 16;
let schedulerRowCount = 0;
const MAX_SCHEDULER_ITEMS = 32;
let networkRowCount = 0;
const MAX_NETWORK_PROFILES = 8;
const modalIcons = ["✓", "⚠", "✖", "❓"];
const modalIconClasses = [
  "modal-icon-success",
  "modal-icon-warning",
  "modal-icon-error",
  "modal-icon-error",
];
let bytes;
const green = "#10b981";
const yellow = "#f59e0b";
const red = "#ef4444";
let testPort = null;
let calibTimer = null;
let ledHeartbeatInterval = null;

const status0 = document.getElementById("status0");
const status1 = document.getElementById("status1");
const status2 = document.getElementById("status2");
const sermon0 = document.getElementById("sermon0");
const sermon1 = document.getElementById("sermon1");

const log = (sermon, msg) => {
  sermon.textContent += msg + "\n";
  sermon.scrollTop = sermon.scrollHeight;
};

const setButtonsState = (disabled) => {
  updateBtn.disabled = disabled;
  installBtn.disabled = disabled;
};

function switchTab(tab) {
  const btnInstall = document.getElementById("tab-install");
  const btnUpgrade = document.getElementById("tab-upgrade");
  const btnConfig = document.getElementById("tab-config");
  const contentInstall = document.getElementById("content-install");
  const contentUpgrade = document.getElementById("content-upgrade");
  const contentConfig = document.getElementById("content-config");

  if (tab === "install") {
    btnInstall.classList.add("active");
    btnUpgrade.classList.remove("active");
    btnConfig.classList.remove("active");
    contentInstall.classList.remove("hidden");
    contentUpgrade.classList.add("hidden");
    contentConfig.classList.add("hidden");
    sermon0.textContent = translations[currentLang].ready;
    status0.textContent = "";
  } else if (tab === "upgrade") {
    btnInstall.classList.remove("active");
    btnUpgrade.classList.add("active");
    btnConfig.classList.remove("active");
    contentInstall.classList.add("hidden");
    contentUpgrade.classList.remove("hidden");
    contentConfig.classList.add("hidden");
    sermon1.textContent = translations[currentLang].ready;
    status1.textContent = "";
  } else {
    btnConfig.classList.add("active");
    btnUpgrade.classList.remove("active");
    btnInstall.classList.remove("active");
    contentInstall.classList.add("hidden");
    contentUpgrade.classList.add("hidden");
    contentConfig.classList.remove("hidden");

    switchSubTab("general");
  }
}

/**
 * Opens a modal window.
 * @param {string} title - Window title
 * @param {string} message - Message text
 * @param {number} icon - Icon index (default 0)
 * @param {boolean} isConfirm - True for Confirm mode (Cancel + OK), False for Info (Close)
 * @returns {Promise<boolean>} Returns true upon confirmation, false upon cancellation/closing
 */
function showModal(title, message, icon = 0, isConfirm = false) {
  // We save the element that had focus before the window was opened.
  lastFocusedElement = document.activeElement;

  const iconElm = document.getElementById("modal-icon");
  iconElm.textContent = modalIcons[icon];
  iconElm.classList.remove(...modalIconClasses);
  iconElm.classList.add(modalIconClasses[icon]);

  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-message").textContent = message;

  const cancelBtn = document.getElementById("modal-cancel-btn");
  const okBtn = document.getElementById("modal-ok-btn");

  // Switching buttons and texts
  if (isConfirm) {
    cancelBtn.style.display = "block";
    okBtn.textContent = translations[currentLang].modalOkBtn;
  } else {
    cancelBtn.style.display = "none";
    okBtn.textContent = translations[currentLang].modalCloseBtn;
  }

  document.getElementById("custom-modal").classList.add("active");

  // Focus setting with a short delay for rendering/animation
  setTimeout(() => {
    if (isConfirm) {
      cancelBtn.focus(); // A safer default choice in Confirm mode
    } else {
      okBtn.focus();
    }
  }, 50);

  return new Promise((resolve) => {
    resolveModalPromise = resolve;
  });
}

/**
 * Safely closes the modal window and resolves the Promise.
 * @param {boolean} result - The result of the action (true = OK, false = Cancel/Escape)
 */
function closeModal(result = false) {
  if (window.event) window.event.preventDefault();
  document.getElementById("custom-modal").classList.remove("active");

  // We will return the focus to the element from which the window was triggered.
  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  if (resolveModalPromise) {
    resolveModalPromise(result);
    resolveModalPromise = null;
  }
}

function t(key, params = {}) {
  // Loads text for the current language (with a fallback to English if the key is missing)
  let text =
    translations[currentLang]?.[key] || translations["en"]?.[key] || key;

  // Replaces all {keys} with their actual values
  for (const [paramKey, value] of Object.entries(params)) {
    text = text.replaceAll(`{${paramKey}}`, value);
  }

  return text;
}

// Helper function to obtain a port (automatically or via selection)
async function getDevicePort(forceSelect = false) {
  // 1. If we already have the port in memory and it is still physically connected, we return it
  if (!forceSelect && sharedPort && sharedPort.connected) {
    return sharedPort;
  }

  // 2. Check the ports for which the user has previously granted permission
  if (!forceSelect) {
    const authorizedPorts = await navigator.serial.getPorts();

    // Optional: filter for only native Espressif USB chips (Vendor ID 0x303A)
    const espPorts = authorizedPorts.filter((p) => {
      const info = p.getInfo();
      return info.usbVendorId === 0x303a;
    });

    // If exactly one allowed ESP device is connected, we use it without asking
    if (espPorts.length === 1) {
      sharedPort = espPorts[0];
      return sharedPort;
    }
    // Fallback option if the user is using an external USB-UART converter (CH340, CP2102)
    if (authorizedPorts.length === 1) {
      sharedPort = authorizedPorts[0];
      return sharedPort;
    }
  }

  // 3. If there are no allowed ports (or the user wants to select a different one), we open a dialog
  sharedPort = await navigator.serial.requestPort();
  return sharedPort;
}

async function readOffsets() {
  try {
    // 1. Downloading the platformio.ini file
    const iniResponse = await fetch("../platformio.ini");
    if (!iniResponse.ok) {
      throw new Error(
        `Failed to load platformio.ini (HTTP ${iniResponse.status})`,
      );
    }
    const iniContent = await iniResponse.text();

    // 2. Retrieving the value of board_build.partitions from the [env:miniradiozero] section
    let inTargetSection = false;
    let partitionsRelPath = null;

    for (const rawLine of iniContent.split(/\r?\n/)) {
      const line = rawLine.trim();

      if (line.startsWith("[") && line.endsWith("]")) {
        inTargetSection = line === "[env:miniradiozero]";
        continue;
      }

      if (inTargetSection && !line.startsWith(";") && !line.startsWith("#")) {
        const match = line.match(/^board_build\.partitions\s*=\s*(.+)$/);
        if (match) {
          partitionsRelPath = match[1].split(/[;#]/)[0].trim();
          break;
        }
      }
    }

    if (!partitionsRelPath) {
      throw new Error(
        "The parameter board_build.partitions was not found in the [env:miniradiozero] section..",
      );
    }

    // 3. Constructing the URL path (adding "../") and downloading the CSV file
    // Handling the case where the path in the .ini file might already start with a slash
    const cleanRelPath = partitionsRelPath.replace(/^\/+/, "");
    const csvUrl = `../${cleanRelPath}`;

    const csvResponse = await fetch(csvUrl);
    if (!csvResponse.ok) {
      throw new Error(
        `Failed to load the file ${csvUrl} (HTTP ${csvResponse.status})`,
      );
    }
    const csvContent = await csvResponse.text();

    // 4. Obtaining offsets for otadata and app0
    let otadataOffset = null;
    let app0Offset = null;

    for (const rawLine of csvContent.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const columns = line.split(",").map((col) => col.trim());
      const name = columns[0];
      const offset = columns[3]; // 4th column (index 3) is Offset

      if (name === "otadata") {
        otadataOffset = offset;
      } else if (name === "app0") {
        app0Offset = offset;
      }
    }

    // Output results to the browser console (F12)
    return [otadataOffset, app0Offset];
  } catch (err) {
    console.error("readOffsets() error", err);
  }
}

// Downloads a binary file and converts it into a format for esptool-js
async function fetchBinary(sermon, url) {
  log(sermon, `${translations[currentLang].downloading}: ${url}`);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `${translations[currentLang].cannotDownload} ${url} (HTTP ${response.status})`,
    );
  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return binaryString;
}

// Shared function for flashing (cleanInstall = true for a complete installation)
async function runFlash(cleanInstall, activeStatus, activeSermon) {
  const [odOffset, appOffset] = (await readOffsets()) || [];

  if (odOffset !== undefined && appOffset !== undefined) {
  } else {
    odOffset = "0xe000";
    fwOffset = "0x10000";
  }
  // Setting paths to your files and their memory addresses
  const FIRMWARE_DIR = "../tool/firmware/";
  const FILES_FULL_INSTALL = [
    { path: FIRMWARE_DIR + "bootloader.bin", address: 0x0000 }, // ESP32-S3 !
    { path: FIRMWARE_DIR + "partitions.bin", address: 0x8000 },
    { path: FIRMWARE_DIR + "boot_app0.bin", address: Number(odOffset) },
    { path: FIRMWARE_DIR + "firmware.bin", address: Number(appOffset) },
  ];
  const FILES_UPDATE_ONLY = [
    { path: FIRMWARE_DIR + "firmware.bin", address: Number(appOffset) },
  ];

  if (cleanInstall) {
    const confirmed = await showModal(
      translations[currentLang].question,
      translations[currentLang].reallyDelete,
      3,
      true,
    );
    if (!confirmed) return;
  }

  setButtonsState(true);
  activeSermon.textContent = "";

  try {
    // Dynamic library import
    const { ESPLoader, Transport } =
      await import("https://unpkg.com/esptool-js@0.5.4/bundle.js");

    // 1. Port selection and connection
    const port = await getDevicePort();
    const transport = new Transport(port, true);

    const loader = new ESPLoader({
      transport,
      //baudrate: 921600
      baudrate: 460800,
      terminal: {
        clean: () => {},
        writeLine: (data) => log(activeSermon, data),
        write: (data) => {
          activeSermon.textContent += data;
        },
      },
    });
    activeStatus.innerHTML = `<span style="color:${green}">${translations[currentLang].chipConnect}</span>`;

    await loader.main();

    // 2. Downloading the necessary files based on the selected mode
    const filesToLoad = cleanInstall ? FILES_FULL_INSTALL : FILES_UPDATE_ONLY;
    const fileArray = [];

    for (const item of filesToLoad) {
      const data = await fetchBinary(activeSermon, item.path);
      fileArray.push({ data, address: item.address });
    }

    // 3. Writing to flash memory
    if (cleanInstall) {
      log(activeSermon, translations[currentLang].erasingMemory);
      activeStatus.innerHTML = `<span style="color:${yellow}">${translations[currentLang].erMem}</span>`;
    } else {
      log(activeSermon, translations[currentLang].uploadUpdate);
    }

    await loader.writeFlash({
      fileArray,
      flashSize: "4MB",
      flashMode: "dio",
      flashFreq: "80m",
      eraseAll: cleanInstall,
      compress: true,
      reportProgress: (fileIndex, written, total) => {
        const percent = Math.round((written / total) * 100);
        activeStatus.innerHTML = `<span style="color:${green}">${translations[currentLang].file} ${fileIndex + 1}/${fileArray.length}: ${percent} %</span>`;
      },
    });

    // 4. Attempt to restart and safely release the port
    log(activeSermon, translations[currentLang].restartAttempt);
    try {
      await port.setSignals({ dataTerminalReady: false, requestToSend: true });
      await new Promise((r) => setTimeout(r, 100));
      await port.setSignals({ dataTerminalReady: false, requestToSend: false });
      await transport.disconnect();
    } catch (e) {
      // Ignore any potential error when disconnecting the port during a restart
    }

    log(activeSermon, translations[currentLang].done);
    activeStatus.innerHTML = `<span style="color:${green}">${translations[currentLang].completed}</span>`;
  } catch (err) {
    log(activeSermon, `${translations[currentLang].error}: ${err.message}`);
    activeStatus.innerHTML = `<span style="color:${red}">${translations[currentLang].error}: ${err.message}</span>`;
  } finally {
    setButtonsState(false);
  }
}

// PART 2 - CONFIGURATION
let inputBuffer = "";

async function readSerial() {
  if (!("serial" in navigator)) {
    showModal(
      translations[currentLang].error,
      translations[currentLang].noSupport,
      2,
    );
    return;
  }

  try {
    // 1. Requesting a port from the user
    const port = await getDevicePort();
    if (port.readable || port.writable) {
      closeSerialPortSafely(port);
    }
    // 2. Opening the port at a speed of 115,200 baud
    await port.open({ baudRate: 115200 });

    // 3. Visual status update to Green "Connected"
    if (status2) {
      status2.innerHTML = `<span style="color:${green}">${translations[currentLang].statusConnected}</span>`;
    }

    // 4. Sending a request to the ESP32 to send its config.json
    await sendSerialCommand(port, "GET_CONFIG");

    // 5. Starting an asynchronous loop for continuous data reading in the background
    readSerialLoop(port);
  } catch (error) {
    console.error("Serial connection failed:", error);
    if (status2) {
      status2.innerHTML = `<span style="color:${red}">❌ Connection Error: ${error.message}</span>`;
    }
    showModal(translations[currentLang].connFailed, error.message, 2);
  }
}

async function readSerialLoop(port) {
  let reader;
  let readableStreamClosed;
  if (status2) {
    status2.innerHTML = `<span style="color:#10b981">${translations[currentLang].radioReadStart}</span>`;
  }

  while (port && port.readable) {
    let flag = false;
    const textDecoder = new TextDecoderStream();
    // We store the promise from pipeTo so that we can wait for it later
    readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          flag = processIncomingChunk(value);
          if (flag) {
            break;
          }
        }
      }
    } catch (error) {
      console.error("Read error context:", error);
    } finally {
      // 1. We must explicitly cancel the read; calling releaseLock alone is not enough!
      // This releases the lock from pipeTo on the original port.readable.
      await reader.cancel().catch(() => {});

      // 2. We wait for pipeTo to terminate correctly (it throws an error about cancellation, we ignore it)
      await readableStreamClosed.catch(() => {});

      // 3. Release the lock on the reader itself
      reader.releaseLock();
    }

    if (flag) {
      if (status2) {
        status2.innerHTML = t("radioReadCompl", {
          bytes: bytes,
        });
      }
      break;
    }
  }

  // All streams are now unlocked, and the port can be safely closed.
  if (port) {
    closeSerialPortSafely(port);
  }
}

// Combines raw data chunks into full delimited text lines
function processIncomingChunk(chunk) {
  inputBuffer += chunk;

  // The browser sometimes splits a single long line into multiple chunks.
  // We split the buffer by \n
  let lines = inputBuffer.split("\n");

  // We return the last partially written piece to the buffer and wait for the rest of the text.
  inputBuffer = lines.pop();

  for (let line of lines) {
    line = line.trim();

    if (line.length === 0) continue;

    // Debug dump so we can see the traffic
    console.log("SERIAL LINE:", line);

    if (line.startsWith("CONFIG_DATA:")) {
      const jsonString = line.replace("CONFIG_DATA:", "").trim();

      // COMPLETENESS CHECK: If the JSON does not end with a closing brace },
      // it means the browser hasn't finished reading the entire thing yet.
      // We put it back into the buffer and wait for the rest of the line!
      if (!jsonString.endsWith("}")) {
        console.warn(
          "⚠️ Incomplete JSON received, buffering and waiting for the rest...",
        );
        inputBuffer = line + "\n" + inputBuffer;
        continue;
      }

      console.log("📦 COMPLETE JSON ARRIVED, PARSING...");
      bytes = jsonString.length;
      populateFormWithConfig(jsonString);

      if (status2) {
        status2.innerHTML = t("receivedBytes", {
          bytes: bytes,
        });
      }
      return true;
    }
  }
}

// High-performance asynchronous chunked transmitter to prevent ESP32 FIFO overflow
async function sendSerialCommand(port, commandText) {
  if (!port || !port.writable) {
    showModal(
      translations[currentLang].error,
      translations[currentLang].notConnect, //Serial port is not writable. Connect first
      2,
    );
    return;
  }

  const encoder = new TextEncoder();
  // Append the termination newline so the ESP32 C-string loop registers line-end
  const fullPayload = encoder.encode(commandText + "\n");
  const writer = port.writable.getWriter();

  const CHUNK_SIZE = 64; // Safe envelope size matching ESP32 internal registers
  const CHUNK_DELAY = 10; // 10ms rest period gives FreeRTOS loop plenty of time to drain buffer

  try {
    let offset = 0;

    // Loop through the byte array and slice it down into small envelopes
    while (offset < fullPayload.length) {
      const chunk = fullPayload.slice(offset, offset + CHUNK_SIZE);
      await writer.write(chunk);
      offset += CHUNK_SIZE;

      // Inject the calculated rest window unless it was the final segment
      if (offset < fullPayload.length) {
        await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY));
      }
    }

    console.log(
      `📡 Chunked transmission complete. Sent ${fullPayload.length} bytes.`,
    );
    console.log(`Chunked text:\n${commandText.trim()}`);
  } catch (error) {
    console.error("Chunked write failed:", error);
  } finally {
    writer.releaseLock();
  }
}

// Extracted payload builder framework utility shared between File and Serial outputs
function gatherFormPayload() {
  const hostname =
    document.getElementById("cfg-hostname").value || "MiniRadioZero";
  const defvol = parseInt(document.getElementById("cfg-defvol").value) || 50;
  const defstat = parseInt(document.getElementById("cfg-defstat").value) || 0;
  const led_bright =
    parseInt(document.getElementById("led_bright").value) || 66;
  const led_yel_mix = parseInt(document.getElementById("led_yel").value) || 70;
  const led_order = document.getElementById("led_type").value || "GRB";

  const ntpServer =
    document.getElementById("cfg-ntp-server").value || "pool.ntp.org";
  const ntpInterval =
    parseInt(document.getElementById("cfg-ntp-interval").value) || 15;
  const ntpTimezone = document.getElementById("cfg-ntp-timezone").value || "";
  const ntpTzname = document.getElementById("cfg-ntp-tzname").value || "";

  const finalConfig = {
    defvol: defvol,
    defstat: defstat,
    hostname: hostname,
    led_bright: led_bright,
    led_yel_mix: led_yel_mix,
    led_order: led_order,
    ntp: {
      server: ntpServer,
      interval: ntpInterval,
      timezone: ntpTimezone,
      tzname: ntpTzname,
    },
    radio: [],
    scheduler: {
      sched_enabled: document.getElementById("cfg-sched-enabled").checked
        ? 1
        : 0,
      unmute: document.getElementById("cfg-sched-unmute").checked ? 1 : 0,
      items: [],
    },
    network: [],
  };

  // Extract rows for stations, scheduler items, and network maps exactly like your standard save pipeline
  document.querySelectorAll("#container-radio .row-entry").forEach((row) => {
    const nameInput = row.querySelector(".radio-name-input");
    const urlInput = row.querySelector(".radio-url-input");
    if (nameInput && urlInput && nameInput.value.trim() !== "") {
      finalConfig.radio.push({
        name: nameInput.value.trim(),
        url: urlInput.value.trim(),
      });
    }
  });

  document
    .querySelectorAll("#container-scheduler .row-entry")
    .forEach((row) => {
      const labelInput = row.querySelector(".sched-label-input");
      const timeInput = row.querySelector(".sched-time-input");
      const stationInput = row.querySelector(".sched-station-input");
      let wdaysString = "";
      row.querySelectorAll(".day-bit").forEach((cb) => {
        if (cb && cb.checked) wdaysString += cb.getAttribute("data-day");
      });
      if (timeInput && timeInput.value !== "") {
        finalConfig.scheduler.items.push({
          label: labelInput ? labelInput.value.trim() : "Task",
          time: timeInput.value,
          wdays: wdaysString,
          station: parseInt(stationInput ? stationInput.value : 0) || 0,
        });
      }
    });

  document.querySelectorAll("#container-network .row-entry").forEach((row) => {
    const locInput = row.querySelector(".net-location-input");
    const ssidInput = row.querySelector(".net-ssid-input");
    const bssidInput = row.querySelector(".net-bssid-input");
    const passInput = row.querySelector(".net-pass-input");
    const dhcpInput = row.querySelector(".net-dhcp-input");
    if (ssidInput && ssidInput.value.trim() !== "") {
      const isDhcp = dhcpInput.checked ? 1 : 0;
      finalConfig.network.push({
        location: locInput ? locInput.value.trim() : "Profile",
        wifibssid: bssidInput.value.trim(),
        wifipass: passInput ? passInput.value : "",
        ssid: ssidInput.value.trim(),
        dhcp: isDhcp,
        ipaddress: isDhcp
          ? ""
          : row.querySelector(".net-ip-input").value.trim(),
        subnet: isDhcp
          ? ""
          : row.querySelector(".net-subnet-input").value.trim(),
        gateway: isDhcp
          ? ""
          : row.querySelector(".net-gateway-input").value.trim(),
        dnsadd: isDhcp ? "" : row.querySelector(".net-dns-input").value.trim(),
      });
    }
  });

  return finalConfig;
}

async function saveConfigToRadio() {
  if (window.event) window.event.preventDefault(); // Preventing submission
  if (!("serial" in navigator)) {
    showModal(
      translations[currentLang].error,
      translations[currentLang].noSupport,
      2,
    );
    return;
  }

  // Using a shared data generator
  const finalConfig = gatherFormPayload();
  if (!finalConfig) {
    if (status2) {
      status2.innerHTML = `<span style="color:${yellow}">${translations[currentLang].failedLoad}</span>`; //Failed to load data from the forms
    }
    return;
  }
  const stringData = JSON.stringify(finalConfig, null, 2);
  const config = JSON.parse(stringData);
  radioCount = 0;
  if (config.radio && Array.isArray(config.radio)) {
    config.radio.forEach((station) => {
      radioCount += 1;
    });
  }
  netCount = 0;
  if (config.network && Array.isArray(config.network)) {
    config.network.forEach((net) => {
      netCount += 1;
    });
  }
  const a = Number(netCount > 0);
  const b = Number(radioCount > 0);

  if (radioCount === 0 || netCount === 0) {
    const confirmed = await showModal(
      translations[currentLang].question,
      translations[currentLang][`noData${a}${b}`],
      3,
      true,
    );
    if (!confirmed) return;
  }

  try {
    // 1. Requesting a port from the user
    const port = await getDevicePort();
    if (port.readable || port.writable) {
      closeSerialPortSafely(port);
    }
    // 2. Opening the port at a speed of 115,200 baud
    await port.open({ baudRate: 115200 });

    if (status2) {
      status2.innerHTML = `<span style="color:${green}">${translations[currentLang].statusConnected}</span>`;
    }

    const finalCommand = `SET_CONFIG:${JSON.stringify(finalConfig)}`;

    if (status2) {
      status2.innerHTML = `<span style="color:${green}">${translations[currentLang].waitStart}</span>`; //I am waiting for the start...
    }

    // 1. First, we send a notification to the ESP32 to immediately stop the audio task.
    await sendSerialCommand(port, "PREPARE_WRITE");

    // 2. We will wait 500 milliseconds directly in the browser to let the hardware settle down.
    await new Promise((res) => setTimeout(res, 500));
    if (status2) {
      status2.innerHTML = `<span style="color:${green}">${translations[currentLang].writingStarted}</span>`; //Writing started
    }

    // 3. Only now will we send our entire, long, collected JSON payload.
    await sendSerialCommand(port, finalCommand);
    await new Promise((res) => setTimeout(res, 500));

    if (status2) {
      status2.innerHTML = t("writFinished", {
        bytes: finalCommand.length,
      });
    }
    closeSerialPortSafely(port);
  } catch (err) {
    showModal(translations[currentLang].error, err.message, 2);
  }
}

function switchSubTab(targetPanel) {
  // The key line that prevents form submission and page reloading!
  if (window.event) window.event.preventDefault();

  const buttons = document.querySelectorAll(".config-sidebar .sub-btn");
  const panels = document.querySelectorAll(".config-panels .sub-panel");

  buttons.forEach((btn) => btn.classList.remove("active"));
  panels.forEach((p) => p.classList.add("hidden"));

  document.getElementById(`subtab-${targetPanel}`).classList.add("active");
  document.getElementById(`panel-${targetPanel}`).classList.remove("hidden");
}

// Function to generate a new radio station row
function addRadioRow(initialName = "", initialUrl = "") {
  if (window.event) window.event.preventDefault(); // Stop form submit

  if (radioRowCount >= MAX_RADIO_STATIONS) {
    showModal(
      translations[currentLang].warning,
      translations[currentLang].maxLimit +
        MAX_RADIO_STATIONS.toString() +
        translations[currentLang].maxLimitRadio,
      1,
    );
    return;
  }

  const container = document.getElementById("container-radio");

  // Create a unique timestamp ID for DOM management
  const uniqueId = "radio-row-" + Date.now() + Math.floor(Math.random() * 100);

  // Build the row template using clean native DOM injection
  const row = document.createElement("div");
  row.id = uniqueId;
  row.className = "row-entry";

  // Grid layout for station properties with dynamic ID label
  row.innerHTML = `
        <button data-i18n="remove" type="button" class="remove-btn" onclick="removeRadioRow('${uniqueId}')">❌ Remove</button>
        <div style="font-weight: bold; color: #38bdf8; margin-bottom: 10px; font-size: 13px;">
            <span data-i18n="stationIdLabel">Station ID</span>: <span class="station-index">0</span>
        </div>
        <div class="form-grid-2">
            <div>
                <label data-i18n="stationName">Station Name</label>
                <input type="text" class="radio-name-input" value="${initialName}" placeholder="e.g. ČRo Radiožurnál">
            </div>
            <div>
                <label data-i18n="stationUrl">Stream URL</label>
                <input type="text" class="radio-url-input" value="${initialUrl}" placeholder="http://...">
            </div>
        </div>
    `;

  container.appendChild(row);
  radioRowCount++;

  // Refresh IDs and string translations for the newly injected element
  updateRadioIndices();
  changeLanguage(currentLang);
}

// Function to remove a row and trigger recalculation
function removeRadioRow(rowId) {
  if (window.event) window.event.preventDefault();

  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    radioRowCount--;
    updateRadioIndices(); // Reindex everything sequentially
  }
}

// Recalculates visible Station IDs from 0 upwards sequentially
function updateRadioIndices() {
  const indices = document.querySelectorAll("#container-radio .station-index");
  indices.forEach((span, index) => {
    span.textContent = index;
  });

  // Update the counter text in the panel header
  const counterSpan = document.getElementById("count-radio");
  if (counterSpan) {
    counterSpan.textContent = radioRowCount;
  }
}

// Main function to add a scheduler task row
function addSchedulerRow(
  initialLabel = "",
  initialTime = "00:00",
  initialWdays = "0123456",
  initialStation = 0,
) {
  if (window.event) window.event.preventDefault();

  if (schedulerRowCount >= MAX_SCHEDULER_ITEMS) {
    showModal(
      translations[currentLang].warning,
      translations[currentLang].maxLimit +
        MAX_SCHEDULER_ITEMS.toString() +
        translations[currentLang].maxLimitScheduler,
      1,
    );
    return;
  }

  const container = document.getElementById("container-scheduler");
  const uniqueId = "sched-row-" + Date.now() + Math.floor(Math.random() * 100);

  const row = document.createElement("div");
  row.id = uniqueId;
  row.className = "row-entry";
  // Store attributes for chronological sorting algorithm
  row.setAttribute("data-time", initialTime);

  let weekdaysHtml = "";

  for (let i = 0; i < 7; i++) {
    const checked = initialWdays.includes(i.toString()) ? "checked" : "";
    weekdaysHtml += `
            <div class="weekday-checkbox">
                <span data-i18n="day${i}">day</span>
                <input type="checkbox" class="day-bit" data-day="${i}" ${checked} onchange="updateSchedulerOrder()">
            </div>
        `;
  }

  row.innerHTML = `
        <button data-i18n="remove" type="button" class="remove-btn" onclick="removeSchedulerRow('${uniqueId}')">❌ Remove</button>
        <div class="form-grid-3">
            <div>
                <label data-i18n="schedLabel">Task Label</label>
                <input type="text" class="sched-label-input" value="${initialLabel}" placeholder="e.g. Morning Radio">
            </div>
            <div>
                <label data-i18n="schedTime">Time (HH:MM)</label>
                <!-- onchange fires sorting when user edits time directly -->
                <input type="time" class="sched-time-input" value="${initialTime}" onchange="this.parentElement.parentElement.parentElement.setAttribute('data-time', this.value);">
            </div>
            <div>
                <label data-i18n="schedStation">Station ID</label>
                <input type="number" class="sched-station-input" min="0" value="${initialStation}" placeholder="0">
            </div>
        </div>
        <div style="margin-top: 10px;">
            <label style="display:block; margin-bottom:5px;" data-i18n="schedDays">Active Days</label>
            <div style="display: flex; flex-wrap: wrap;">${weekdaysHtml}</div>
        </div>
    `;

  container.appendChild(row);
  schedulerRowCount++;

  updateSchedulerOrder();
  changeLanguage(currentLang);
}

function removeSchedulerRow(rowId) {
  if (window.event) window.event.preventDefault();
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    schedulerRowCount--;
    updateSchedulerOrder();
  }
}

// Chronological sorting engine (HH:MM asc)
function updateSchedulerOrder() {
  const container = document.getElementById("container-scheduler");
  const rows = Array.from(container.querySelectorAll(".row-entry"));

  // Sort array by the data-time attribute string
  rows.sort((a, b) => {
    const timeA = a.getAttribute("data-time") || "00:00";
    const timeB = b.getAttribute("data-time") || "00:00";
    return timeA.localeCompare(timeB);
  });

  // Re-append elements in sorted order back into DOM
  rows.forEach((row) => container.appendChild(row));

  // Update global panel counters
  const counterSpan = document.getElementById("count-scheduler");
  if (counterSpan) counterSpan.textContent = schedulerRowCount;
}

// Main function to inject a network profile container
function addNetworkRow(
  initialLocation = "",
  initialSsid = "",
  initialBssid = "",
  initialPass = "",
  initialDhcp = 1,
  initialIp = "",
  initialSubnet = "",
  initialGateway = "",
  initialDns = "",
) {
  if (window.event) window.event.preventDefault();

  if (networkRowCount >= MAX_NETWORK_PROFILES) {
    showModal(
      translations[currentLang].warning,
      translations[currentLang].maxLimit +
        MAX_NETWORK_PROFILES.toString() +
        translations[currentLang].maxLimitNetwork,
      1,
    );
    return;
  }

  const container = document.getElementById("container-network");
  const uniqueId = "net-row-" + Date.now() + Math.floor(Math.random() * 100);

  const row = document.createElement("div");
  row.id = uniqueId;
  row.className = "row-entry";

  // Set visibility state based on DHCP value (1 = hidden, 0 = visible)
  const staticFieldsDisplay = initialDhcp === 1 ? "none" : "grid";
  const dhcpChecked = initialDhcp === 1 ? "checked" : "";

  row.innerHTML = `
        <button data-i18n="remove" type="button" class="remove-btn" onclick="removeNetworkRow('${uniqueId}')">❌ Remove</button>
        
        <div class="form-grid-3">
            <div>
                <label data-i18n="netLocation">Location Profile Name</label>
                <input type="text" class="net-location-input" value="${initialLocation}" placeholder="e.g. Home, Work">
            </div>
            <div>
                <label data-i18n="wifiSsid">Wi-Fi SSID</label>
                <input type="text" class="net-ssid-input" value="${initialSsid}" placeholder="SSID Name">
                <input type="hidden" class="net-bssid-input" value="${initialBssid}">
            </div>
            <div>
                <label data-i18n="wifiPass">Wi-Fi Password</label>
                <input type="password" class="net-pass-input" value="${initialPass}" placeholder="••••••••">
            </div>
        </div>

        <div style="display:flex; align-items:center; gap:8px; margin: 10px 0 15px 0;">
            <input type="checkbox" class="net-dhcp-input" ${dhcpChecked} style="width:auto; margin:0;" 
                   onchange="toggleStaticFields('${uniqueId}', this.checked)">
            <label data-i18n="netDhcp">Enable DHCP (Automatic IP)</label>
        </div>

        <!-- CONDITIONAL STATIC IP FIELDS CONTAINER -->
        <div id="static-fields-${uniqueId}" class="form-grid-2" style="display: ${staticFieldsDisplay}; background: rgba(15, 23, 42, 0.4); padding: 14px; border-radius: 8px; border: 1px solid #2d3748;">
            <div>
                <label data-i18n="netIp">Static IP Address</label>
                <input type="text" class="net-ip-input" value="${initialIp}" placeholder="192.168.1.100">
                
                <label data-i18n="netSubnet" style="display:block; margin-top:10px;">Subnet Mask</label>
                <input type="text" class="net-subnet-input" value="${initialSubnet}" placeholder="255.255.255.0">
            </div>
            <div>
                <label data-i18n="netGateway">Gateway Address</label>
                <input type="text" class="net-gateway-input" value="${initialGateway}" placeholder="192.168.1.1">
                
                <label data-i18n="netDns" style="display:block; margin-top:10px;">Primary DNS Server</label>
                <input type="text" class="net-dns-input" value="${initialDns}" placeholder="8.8.8.8">
            </div>
        </div>
    `;

  container.appendChild(row);
  networkRowCount++;

  updateNetworkCounter();
  changeLanguage(currentLang);
}

function removeNetworkRow(rowId) {
  if (window.event) window.event.preventDefault();
  const row = document.getElementById(rowId);
  if (row) {
    row.remove();
    networkRowCount--;
    updateNetworkCounter();
  }
}

// Reactive UI Toggler for DHCP state
function toggleStaticFields(rowId, isDhcpChecked) {
  const staticContainer = document.getElementById(`static-fields-${rowId}`);
  if (staticContainer) {
    // If DHCP is checked, hide static configuration grid. Otherwise show it.
    staticContainer.style.display = isDhcpChecked ? "none" : "grid";
  }
}

function updateNetworkCounter() {
  const counterSpan = document.getElementById("count-network");
  if (counterSpan) counterSpan.textContent = networkRowCount;
}

// Function to clear all dynamic areas and populate them from a JSON string
function populateFormWithConfig(jsonString) {
  try {
    const config = JSON.parse(jsonString);

    // --- 1. POPULATE GENERAL & NTP SETTINGS ---
    if (config.hostname !== undefined)
      document.getElementById("cfg-hostname").value = config.hostname;
    if (config.defvol !== undefined)
      document.getElementById("cfg-defvol").value = config.defvol;
    if (config.defstat !== undefined)
      document.getElementById("cfg-defstat").value = config.defstat;

    let flag0 = false;
    let flag1 = false;
    let flag2 = false;

    if (config.led_order !== undefined) {
      document.getElementById("led_type").value = config.led_order;
      flag0 = true;
    }
    if (config.led_bright !== undefined) {
      document.getElementById("led_bright").value = config.led_bright;
      flag1 = true;
    }
    if (config.led_yel_mix !== undefined) {
      document.getElementById("led_yel").value = config.led_yel_mix;
      flag2 = true;
    }

    if (flag0 && flag1 && flag2) {
      document.getElementById("preview_label").textContent =
        `${config.led_order} ${config.led_bright} ${config.led_yel_mix}`;
    }

    if (config.ntp) {
      if (config.ntp.server !== undefined)
        document.getElementById("cfg-ntp-server").value = config.ntp.server;
      if (config.ntp.interval !== undefined)
        document.getElementById("cfg-ntp-interval").value = config.ntp.interval;
      if (config.ntp.timezone !== undefined)
        document.getElementById("cfg-ntp-timezone").value = config.ntp.timezone;
      if (config.ntp.tzname !== undefined)
        document.getElementById("cfg-ntp-tzname").value = config.ntp.tzname;
    }

    // --- 2. POPULATE RADIO STATIONS ---
    const radioContainer = document.getElementById("container-radio");
    if (radioContainer) {
      radioContainer.innerHTML = ""; // Clear existing rows
      radioRowCount = 0;

      if (config.radio && Array.isArray(config.radio)) {
        config.radio.forEach((station) => {
          addRadioRow(station.name || "", station.url || "");
        });
      }
    }

    // --- 3. POPULATE SCHEDULER ---
    if (config.scheduler) {
      document.getElementById("cfg-sched-enabled").checked =
        config.scheduler.sched_enabled === 1;
      document.getElementById("cfg-sched-unmute").checked =
        config.scheduler.unmute === 1;

      const schedContainer = document.getElementById("container-scheduler");
      if (schedContainer) {
        schedContainer.innerHTML = ""; // Clear existing rows
        schedulerRowCount = 0;

        if (config.scheduler.items && Array.isArray(config.scheduler.items)) {
          config.scheduler.items.forEach((item) => {
            addSchedulerRow(
              item.label || "",
              item.time || "00:00",
              item.wdays || "0123456",
              item.station || 0,
            );
          });
        }
      }
    }

    // --- 4. POPULATE NETWORK PROFILES ---
    const netContainer = document.getElementById("container-network");
    if (netContainer) {
      netContainer.innerHTML = ""; // Clear existing rows
      networkRowCount = 0;

      if (config.network && Array.isArray(config.network)) {
        config.network.forEach((net) => {
          addNetworkRow(
            net.location || "",
            net.ssid || "",
            net.wifibssid || "",
            net.wifipass || "",
            net.dhcp !== undefined ? net.dhcp : 1,
            net.ipaddress || "",
            net.subnet || "",
            net.gateway || "",
            net.dnsadd || "",
          );
        });
      }
    }
  } catch (e) {
    console.error("Failed to parse and populate configuration JSON:", e);
    showModal(translations[currentLang].parsError, e.message, 2);
  }
}

// Opens a local json file, reads its string content, and forces immediate form generation
function readFile(inputElement) {
  const file = inputElement.files[0];
  if (!file) return;

  const fileReader = new FileReader();
  fileReader.onload = function (event) {
    const fileContent = event.target.result;

    // Pass the string buffer down directly to our standard layout builder loop
    status2.innerHTML = `<span style="color:${green}">${fileContent.length} ${translations[currentLang].readingFile} ${file.name} ...</span>`;
    populateFormWithConfig(fileContent);

    // Reset the file input value so user can upload the same file name repeatedly
    inputElement.value = "";
  };
  fileReader.readAsText(file);
}

function readConfigFromFile() {
  document.getElementById("file-loader-input").click();
}

async function saveConfigToFile() {
  status2.innerHTML = "";
  if (window.event) window.event.preventDefault();

  const finalConfig = gatherFormPayload();
  if (!finalConfig) {
    if (status2) {
      status2.innerHTML = `<span style="color:${yellow}">${translations[currentLang].failedLoad}</span>`; //Failed to load data from the forms
    }
    console.error("Failed to gather payload data.");
    return;
  }

  const stringData = JSON.stringify(finalConfig, null, 2);
  const blob = new Blob([stringData], { type: "application/json" });

  try {
    // Opens the system "Save As" dialog
    const handle = await window.showSaveFilePicker({
      suggestedName: "config.json",
      types: [
        {
          description: "JSON configuration",
          accept: { "application/json": [".json"] },
        },
      ],
    });

    // Writing data to a selected file
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();

    status2.innerHTML = t("fileSaved", {
      file: handle.name,
      size: blob.size,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      status2.innerHTML = `<span style="color:${yellow}">${translations[currentLang].savingCanceled}</span>`;
    } else {
      console.error(`${translations[currentLang].errorSaving}: ${err}`);
      status2.innerHTML = `<span style="color:${red}">${translations[currentLang].errorSaving}</span>`;
    }
  }
}

// Loads version and build date information from version.json
async function loadVersionInfo() {
  try {
    const response = await fetch("../tool/firmware/version.json");
    if (!response.ok) throw new Error("Version file not found");
    const version = await response.json();

    if (version.version) {
      const versionElements = document.querySelectorAll(".version");
      versionElements.forEach((element) => {
        element.textContent = version.version;
      });
    }
    if (version.build_date) {
      const builddateElements = document.querySelectorAll(".builddate");
      builddateElements.forEach((element) => {
        element.textContent = version.build_date;
      });
    }
  } catch (e) {
    console.warn("Could not load firmware version.json:", e);
  }
}

/**
 * Opens a modal window.
 * @param {string} title - Window title
 * @param {string} message - Message text
 * @param {number} icon - Icon index (default 0)
 * @param {boolean} isConfirm - True for Confirm mode (Cancel + OK), False for Info (Close)
 * @returns {Promise<boolean>} Returns true upon confirmation, false upon cancellation/closing
 */
async function showModal2() {
  lastFocusedElement = document.activeElement;
  const sliders = document.getElementById("sliders");
  sliders.classList.add("disabled");
  const cancelBtn = document.getElementById("modal-cancel-btn");
  const okBtn = document.getElementById("modal-ok-btn");
  const sliderBright = document.getElementById("sliderBr");
  const sliderRatio = document.getElementById("sliderYel");
  document.getElementById("led_ind").value =
    document.getElementById("led_type").value;
  sliderRatio.value = document.getElementById("led_yel").value;
  document.getElementById("valYel").value =
    document.getElementById("led_yel").value;
  sliderBright.value = document.getElementById("led_bright").value;
  document.getElementById("valBr").value =
    document.getElementById("led_bright").value;
  document.getElementById("custom-modal2").classList.add("active");
  testPort = await startLedTest();
  await sendSerialCommand(testPort, `LED_TEST: RGB 100 100`);

  // Focus setting with a short delay for rendering/animation
  setTimeout(() => {
    cancelBtn.focus(); // A safer default choice in Confirm mode
  }, 50);
  return new Promise((resolve) => {
    resolveModalPromise = resolve;
  });
}

/**
 * Safely closes the modal window and resolves the Promise.
 * @param {boolean} result - The result of the action (true = OK, false = Cancel/Escape)
 */
function closeModal2(result = false) {
  if (window.event) window.event.preventDefault();
  document.getElementById("custom-modal2").classList.remove("active");

  // We will return the focus to the element from which the window was triggered.
  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }

  if (resolveModalPromise) {
    resolveModalPromise(result);
    resolveModalPromise = null;
  }
}

async function openLedCalibrator() {
  const confirmed = await showModal2(3, true);

  // Ends the ESP32 preview (restores the radio's normal status bar color)
  if (status2) {
    status2.innerHTML = `<span style="color:${green}">${translations[currentLang].calibrCompl}</span>`; //LED calibration complete
  }
  stopLedHeartbeat();
  if (!confirmed) {
    await sendSerialCommand(testPort, `LED_TEST_END`);
    await new Promise((res) => setTimeout(res, 500));
    closeSerialPortSafely(testPort);
    return;
  }
  // The user confirmed the set values
  const br = document.getElementById("sliderBr").value;
  const r = document.getElementById("sliderYel").value;
  const ledtype = document.getElementById("led_ind").value;
  document.getElementById("led_type").value = ledtype;
  document.getElementById("led_yel").value = r;
  document.getElementById("led_bright").value = br;
  document.getElementById("preview_label").textContent =
    `${ledtype} ${br} ${r}`;
  await sendSerialCommand(testPort, `LED_TEST_SAVE`);
  await new Promise((res) => setTimeout(res, 500));
  closeSerialPortSafely(testPort);
}

function setLedOrder(newOrder) {
  const led_ind = document.getElementById("led_ind");
  led_ind.innerHTML = newOrder;
  led_ind.value = newOrder;

  const sliders = document.getElementById("sliders");
  sliders.classList.remove("disabled");

  startLedHeartbeat();

  // Once the correct order is confirmed, we will immediately show the current yellow one.
  sendPreviewThrottled();
}

function onSliderBrChange() {
  document.getElementById("valBr").textContent =
    document.getElementById("sliderBr").value;
  sendPreviewThrottled();
}

function onSliderYelChange() {
  document.getElementById("valYel").textContent =
    document.getElementById("sliderYel").value;
  sendPreviewThrottled();
}

async function closeSerialPortSafely(port) {
  if (!port) return;
  try {
    await port.setSignals({ dataTerminalReady: true, requestToSend: false });
    await new Promise((r) => setTimeout(r, 100));
    await port.close();
  } catch (e) {
    // Ignore any potential error when disconnecting the port
  }
}

async function startLedTest() {
  if (window.event) window.event.preventDefault(); // Preventing submission
  if (!("serial" in navigator)) {
    showModal(
      translations[currentLang].error,
      translations[currentLang].noSupport,
      2,
    );
    return;
  }

  try {
    // 1. Requesting a port from the user
    const port = await getDevicePort();
    if (port.readable || port.writable) {
      closeSerialPortSafely(port);
      //await port.close();
    }
    // 2. Opening the port at a speed of 115,200 baud
    await port.open({ baudRate: 115200 });
    if (status2) {
      status2.innerHTML = `<span style="color:${green}">${translations[currentLang].statusConnected}</span>`;
    }
    return port;
  } catch (err) {
    showModal(translations[currentLang].error, err.message, 2);
  }
}

// 1. The actual sending of current values (common to both sliders and heartbeat)
function sendCurrentLedTest() {
  if (!testPort) return;
  const order = document.getElementById("led_ind").value;
  const br = document.getElementById("sliderBr").value;
  const r = document.getElementById("sliderYel").value;
  sendSerialCommand(testPort, `LED_TEST: ${order} ${br} ${r}`);
}

// 2. Limits sending to a maximum of 1 command per 80 ms when dragging the slider.
function sendPreviewThrottled() {
  if (calibTimer) return;
  calibTimer = setTimeout(() => {
    calibTimer = null;
    sendCurrentLedTest();
  }, 80);
}

// 3. Starts repeating every 2.5 seconds
function startLedHeartbeat() {
  stopLedHeartbeat();
  sendCurrentLedTest();
  ledHeartbeatInterval = setInterval(sendCurrentLedTest, 2500);
}

// 4. Stops repetition and cancels an active throttle.
function stopLedHeartbeat() {
  if (ledHeartbeatInterval) {
    clearInterval(ledHeartbeatInterval);
    ledHeartbeatInterval = null;
  }
  if (calibTimer) {
    clearTimeout(calibTimer);
    calibTimer = null;
  }
}

// --- Initialization of event listeners (run after DOM load) ---
// Linking buttons with a common function
installBtn.addEventListener("click", () => {
  runFlash(true, status0, sermon0);
});
updateBtn.addEventListener("click", () => {
  runFlash(false, status1, sermon1);
});

document
  .getElementById("modal-ok-btn")
  .addEventListener("click", () => closeModal(true));
document
  .getElementById("modal-cancel-btn")
  .addEventListener("click", () => closeModal(false));

// Close by clicking outside the window (on the dark background)
document.getElementById("custom-modal").addEventListener("click", (event) => {
  if (event.target.id === "custom-modal") {
    closeModal(false);
  }
});

// Keyboard control (Escape + Focus trap for Tab)
document.addEventListener("keydown", (event) => {
  const modal = document.getElementById("custom-modal");
  if (!modal || !modal.classList.contains("active")) return;

  // Close using the Escape key (equivalent to Cancel)
  if (event.key === "Escape") {
    closeModal(false);
    return;
  }

  // Locking the Tab key within a window
  if (event.key === "Tab") {
    const cancelBtn = document.getElementById("modal-cancel-btn");
    const okBtn = document.getElementById("modal-ok-btn");

    const focusableElements = [];
    if (cancelBtn.style.display !== "none") {
      focusableElements.push(cancelBtn);
    }
    focusableElements.push(okBtn);

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab (backward movement)
      if (
        document.activeElement === firstElement ||
        !modal.contains(document.activeElement)
      ) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab (forward movement)
      if (
        document.activeElement === lastElement ||
        !modal.contains(document.activeElement)
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
});

document
  .getElementById("modal-ok-btn2")
  .addEventListener("click", () => closeModal2(true));
document
  .getElementById("modal-cancel-btn2")
  .addEventListener("click", () => closeModal2(false));
document.getElementById("custom-modal2").addEventListener("click", (event) => {
  if (event.target.id === "custom-modal2") {
    closeModal2(false);
  }
});

// Keyboard control (Escape + Focus trap for Tab)
document.addEventListener("keydown", (event) => {
  const modal = document.getElementById("custom-modal2");
  if (!modal || !modal.classList.contains("active")) return;

  // Close using the Escape key (equivalent to Cancel)
  if (event.key === "Escape") {
    closeModal2(false);
    return;
  }

  // Locking the Tab key within a window
  if (event.key === "Tab") {
    const cancelBtn = document.getElementById("modal-cancel-btn2");
    const okBtn = document.getElementById("modal-ok-btn2");

    const focusableElements = [];
    if (cancelBtn.style.display !== "none") {
      focusableElements.push(cancelBtn);
    }
    focusableElements.push(okBtn);

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab (backward movement)
      if (
        document.activeElement === firstElement ||
        !modal.contains(document.activeElement)
      ) {
        event.preventDefault();
        lastElement.focus();
      }
    } else {
      // Tab (forward movement)
      if (
        document.activeElement === lastElement ||
        !modal.contains(document.activeElement)
      ) {
        event.preventDefault();
        firstElement.focus();
      }
    }
  }
});

window.addEventListener("DOMContentLoaded", () => {
  changeLanguage("en");

  loadVersionInfo();
});
