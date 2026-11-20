// --- 1. LOCALIZATION DICTIONARY ---
const translations = {
  en: {
    title: "MiniRadioZero - Installation/Upgrade & Setup",
    subtitle: "Web portal for flashing and radio configuration",
    statusDisconnected: "Device disconnected",
    statusConnected: "Connected",
    tabInstall: "📥 Initial Installation",
    tabUpgrade: "📥 Upgrade",
    tabConfig: "⚙️ Configuration",
    flashHeading: "Flash Firmware",
    upgradeHeading: "Upgrade Firmware",
    flashText:
      "This action writes the complete firmware to your ESP32-S3. All previous data on the chip will be erased.",
    upgradeText:
      "Only an upgrade will be performed. All data will be preserved.",
    flashBtn: "Upload Firmware to Radio",
    upgradeBtn: "Upgrade Firmware",
    reqHeading: "💡 Requirements for a successful flash:",
    version: "Version",
    builddate: "Build Date",
    req1: "Google Chrome or Microsoft Edge browser on a PC.",
    req2: "Connect the board using a data USB cable.",
    req3: 'After the installation is complete, you need to configure the device. For this, you can use either this portal – tab <span style="color:#38bdf8; font-weight:bold;">Configuration</span> and/or the <a href="../tool/MiniRadioZero_bundle.zip">Flash tool</a> script. A detailed description of the Flash tool can be found in the <strong>README.md</strong> file on the project home page.',
    configHeading: "Manage Configuration",
    configSub:
      "Reading and writing settings via a serial link or from/to a file",
    configLoadBtn: "🔌 Read from Radio",
    configReadFileBtn: "📁 Read from File",
    wifiHeading: "Wi-Fi Network",
    wifiSsid: "SSID (Name)",
    wifiPass: "Password",
    stationHeading: "Default Station",
    stationName: "Station Name",
    stationUrl: "Stream URL",
    configSaveBtn: "🔌 Write to Radio",
    configSaveFileBtn: "💾 Save to file",
    footer:
      "MiniRadioZero Project • Powered by GitHub Pages and Web Serial API",
    netLocation: "Location Name",
    netDhcp: "Use DHCP (Auto IP)",
    netIp: "Static IP Address",
    netSubnet: "Subnet Mask",
    netGateway: "Gateway IP",
    netDns: "DNS Server",
    modalCloseBtn: "Close",
    modalOkBtn: "OK",
    modalCancelBtn: "Cancel",
    ntpServerLabel: "NTP Server",
    ntpTimezoneLabel: "Timezone POSIX Expression",
    tipNtpText:
      'Find your regional server setup on the <a href="https://www.ntppool.org/zone/@" target="_blank">NTP Pool Project Zone List</a>.',
    tipTzText:
      'Locate your required POSIX string and region name within the official <a href="https://raw.githubusercontent.com/nayarsystems/posix_tz_db/master/zones.csv" target="_blank">Posix TZ Database</a>.',
    globalsettings: "Global System Settings",
    ntpprotocol: "Network Time Protocol (NTP)",
    defvol: "Default Volume",
    defstat: "Default Station ID",
    hostname: "Hostname",
    interval: "Interval (Minutes)",
    regionname: "Timezone Region Name",
    general: "📋 General & NTP",
    stations: "📻 Radio Stations",
    scheduler: "⏰ Scheduler",
    netProfiles: "🌐 Network Profiles",
    streams: "Radio Streams",
    addStation: "+ Add Station",
    stationIdLabel: "Station ID",
    remove: "❌ Remove",
    schedConfig: "Scheduler Configuration",
    schedItems: "Scheduled Items",
    enableSched: "Enable Global Scheduler",
    unmute: "Unmute on trigger event",
    sort: "↕ Sort",
    addTask: "+ Add Task",
    schedLabel: "Task Label",
    schedTime: "Time (HH:MM)",
    schedStation: "Station ID",
    schedDays: "Active Days",
    wifinets: "WiFi Network Configuration",
    addProfile: "+ Add Profile",
    noSupport:
      "Web Serial API is not supported by your browser. Please use Chrome or Edge.",
    error: "Error",
    connFailed: "Connection Failed",
    notConnect: "Serial port is not writable. Connect first.",
    parsError: "Parsing Error",
    maxLimit: "Maximum limit of ",
    maxLimitRadio: " stations reached.",
    maxLimitScheduler: " tasks reached.",
    maxLimitNetwork: " network profiles reached.",
    warning: "Warning",
    day0: "Su",
    day1: "Mo",
    day2: "Tu",
    day3: "We",
    day4: "Th",
    day5: "Fr",
    day6: "Sa",
    uploadUpdate: "Uploading update...",
    chipConnect: "Connecting to the chip...",
    file: "File",
    downloading: "Downloading",
    cannotDownload: "Cannot download",
    confirmErase:
      "Do you really want to perform a complete installation? All settings will be erased!",
    erasingMemory:
      "Erasing the entire flash memory (this may take a few seconds)...",
    erMem: "Erasing memory...",
    restartAttempt: "I am attempting to restart the device...",
    completed: "Completed!",
    done: "Done! If the radio does not start automatically (the LED does not light up), briefly press the RESET button or unplug the USB cable for a moment.",
    question: "Question",
    reallyDelete: "Really delete all content ?",
    ready: "Ready...\n",
    readingFile: "bytes read from the file",
    fileSaved:
      '<span style="color:#10b981">{size} bytes were ritten to the <b>{file}</b> file.</span>',
    noData00:
      "Are you sure you want to save this configuration to the radio? It doesn't contain a single Wi-Fi network and a single radio station!",
    noData01:
      "Are you sure you want to save this configuration to the radio? It doesn't contain a single Wi-Fi network!",
    noData10:
      "Are you sure you want to save this configuration to the radio? It doesn't contain a single radio station!",
    savingCanceled: "Saving was cancelled",
    errorSaving: "Error saving file",
    radioReadStart: "Started reading data from the radio",
    radioReadCompl:
      '<span style="color:#10b981">Radio reading complete. {bytes} bytes received.</span>',
    receivedBytes: '<span style="color:#10b981">Received {bytes} bytes.</span>',
    failedLoad: "Failed to load data from the forms.",
    waitStart: "I am waiting for the start...",
    writingStarted: "Writing started.",
    writFinished:
      '<span style="color:#10b981">Writing finished. {bytes} bytes sent.</span>',
    calibrCompl: "LED calibration complete.",
    colorCheck: "Color sequence check",
    LEDlit:
      "The LED should now be lit <b style='color:red;'>red</b>. What color do you see?",
    LEDcalibr: "Status LED Calibration",
    litRed: "🔴 Lit up red",
    litGreen: "🟢 Lit up green",
    brSet: "Brightness settings",
    brghtnss: "Brightness (0–100 %):",
    adjShade: "Adjusting the shade of yellow",
    redRatio: "Share of red in the R:G ratio (0–100%):",
    saveBtn: "Use the set values",
    ledStatus: "RGB LED Status",
    ledSettings: "RGB LED Settings",
    brYelCal: "Brightness & Yellow Calibration",
    calibrLED: "🎨 Calibrate LED",
    rgbLabel:
      "Non-editable summary of the RGB LED settings. It includes the LED type (RGB/GRB), brightness (as a percentage), and the red component percentage used to create the yellow color. Values can only be adjusted within the dialog that appears after clicking the 🎨 Calibrate LED button.",
    ledCal:
      "Pressing this button will open a dialog box. In it, you can set the led type (RGB/GRB), the brightness level (in percent) and the proportion of the red component to the yellow color composition (in percent).",
  },
  cs: {
    title: "MiniRadioZero - Instalace/Aktualizace a Nastavení",
    subtitle: "Webový portál pro flashování a správu rádia",
    statusDisconnected: "Zařízení odpojeno",
    statusConnected: "Připojeno",
    tabInstall: "📥 Kompletní instalace",
    tabUpgrade: "📥 Aktualizace",
    tabConfig: "⚙️ Nastavení",
    flashHeading: "Flashování Firmware",
    upgradeHeading: "Aktualizace Firmware",
    flashText:
      "Tato akce zapíše kompletní firmware do vašeho ESP32-S3. Všechna předchozí data na čipu budou smazána.",
    upgradeText:
      "Bude provedena pouze aktualizace. Všechna data zůstanou zachována.",
    flashBtn: "Nahrát Firmware do rádia",
    upgradeBtn: "Aktualizovat Firmware",
    reqHeading: "💡 Požadavky pro úspěšný flash:",
    version: "Verze",
    builddate: "Datum sestavení",
    req1: "Prohlížeč Google Chrome nebo Microsoft Edge na PC.",
    req2: "Připojení desky pomocí datového USB kabelu.",
    req3: 'Po skončení instalace je třeba provést nastavení přístroje. K tomu můžete použít buď tento portál – kartu <span style="color:#38bdf8; font-weight:bold;">Nastavení</span> a/nebo skript <a href="../tool/MiniRadioZero_bundle.zip">Flash tool</a>. Podrobný popis nástroje Flash tool najdete v souboru <strong>README.md</strong> na hlavní stránce projektu.',
    configHeading: "Správa konfigurace",
    configSub: "Načtení a zápis nastavení přes sériovou linku a ze/do souboru",
    configLoadBtn: "🔌 Načíst z rádia",
    configReadFileBtn: "📁 Načíst ze souboru",
    wifiHeading: "Wi-Fi Síť",
    wifiSsid: "SSID (Název)",
    wifiPass: "Heslo",
    stationHeading: "Výchozí stanice",
    stationName: "Název Stanice",
    stationUrl: "URL Streamu",
    configSaveBtn: "🔌 Zapsat do rádia",
    configSaveFileBtn: "💾 Uložit do souboru",
    footer:
      "MiniRadioZero Project • Běží na GitHub Pages s podporou Web Serial API",
    netLocation: "Název profilu / Místo",
    netDhcp: "Použít DHCP (Aut. IP)",
    netIp: "Statická IP Adresa",
    netGateway: "Výchozí brána",
    netDns: "DNS Server",
    modalCloseBtn: "Zavřít",
    modalOkBtn: "Ano",
    modalCancelBtn: "Zrušit",
    ntpServerLabel: "NTP Server",
    ntpTimezoneLabel: "POSIX výraz pro časové pásmo",
    tipNtpText:
      'Seznam dostupných serverů naleznete na stránce <a href="https://www.ntppool.org/zone/@" target="_blank">NTP Pool Project Zone List</a>.',
    tipTzText:
      'Správný POSIX výraz a název regionu pro vaše umístění vyhledejte v <a href="https://raw.githubusercontent.com/nayarsystems/posix_tz_db/master/zones.csv" target="_blank">Posix TZ Database</a>.',
    globalsettings: "Globální nastavení systému",
    ntpprotocol: "Síťový časový protokol (NTP)",
    defvol: "Výchozí hlasitost",
    defstat: "ID výchozí stanice",
    hostname: "Síťový název (Hostname)",
    interval: "Interval (Minuty)",
    regionname: "Název regionu",
    general: "📋 Obecné & NTP",
    stations: "📻 Rozhlasové stanice",
    scheduler: "⏰ Plánovač",
    netProfiles: "🌐 Síťové profily",
    streams: "Rozhlasové streamy",
    addStation: "+ Přidat stanici",
    stationIdLabel: "ID stanice",
    remove: "❌ Odstranit",
    schedConfig: "Nastavení plánovače",
    schedItems: "Položky plánovače",
    enableSched: "Plánovač povolen",
    unmute: "Při události vypnout ztišení",
    sort: "↕ Seřadit",
    addTask: "+ Přidat položku",
    schedLabel: "Popis položky",
    schedTime: "Čas (HH:MM)",
    schedStation: "ID stanice",
    schedDays: "Platí pro dny",
    wifinets: "Konfigurace WiFi sítí",
    addProfile: "+ Přidat profil",
    noSupport:
      "Web Serial API není podporováno vaším prohlížečem. Použijte Chrome nebo Edge.",
    error: "Chyba",
    connFailed: "Připojení selhalo",
    notConnect: "Sériový port není připraven k zápisu. Nejprve se připojte.",
    parsError: "Chyba zpracování",
    maxLimit: "Dosáhl jste maximálního limitu ",
    maxLimitRadio: " rozhlasových stanic.",
    maxLimitScheduler: " položek plánovače.",
    maxLimitNetwork: " síťových profilů.",
    warning: "Upozornění",
    day0: "Ne",
    day1: "Po",
    day2: "Út",
    day3: "St",
    day4: "Čt",
    day5: "Pá",
    day6: "So",
    uploadUpdate: "Nahrávám aktualizaci...",
    chipConnect: "Připojuji se k čipu...",
    file: "Soubor",
    downloading: "Stahuji",
    cannotDownload: "Nelze stáhnout",
    confirmErase:
      "Opravdu chcete provést kompletní instalaci? Veškerá nastavení budou vymazána!",
    erasingMemory: "Mažu celou flash paměť (může to trvat několik sekund)...",
    erMem: "Mazání paměti...",
    restartAttempt: "Pokouším se restartovat zařízení...",
    completed: "Dokončeno!",
    done: "Hotovo! Pokud se rádio samo nespustí (nerozsvítí se LED), stiskněte krátce tlačítko RESET nebo na chvíli odpojte USB kabel.",
    question: "Dotaz",
    reallyDelete: "Opravdu smazat veškerý obsah ?",
    ready: "Připraveno...\n",
    readingFile: "bajtů přečteno ze souboru",
    fileSaved:
      '<span style="color:#10b981">Do souboru <b>{file}</b> bylo zapsáno {size} bajtů.</span>',
    noData00:
      "Skutečně zapsat tuto konfiguraci do rádia? Neobsahuje ani jednu Wi-Fi síť a ani jednu rozhlasovou stanici!",
    noData01:
      "Skutečně zapsat tuto konfiguraci do rádia? Neobsahuje ani jednu Wi-Fi síť!",
    noData10:
      "Skutečně zapsat tuto konfiguraci do rádia? Neobsahuje ani jednu rozhlasovou stanici!",
    savingCanceled: "Ukládání bylo zrušeno",
    errorSaving: "Chyba při ukládání souboru",
    radioReadStart: "Zahájeno čtení dat z rádia",
    radioReadCompl:
      '<span style="color:#10b981">Čtení z rádia ukončeno. Přijato {bytes} bajtů.</span>',
    receivedBytes: '<span style="color:#10b981">Přijato {bytes} bajtů.</span>',
    failedLoad: "Nepodařilo se načíst data z formulářů.",
    waitStart: "Čekám na zahájení...",
    writingStarted: "Zápis zahájen.",
    writFinished:
      '<span style="color:#10b981">Zápis ukončen. Zapsáno {bytes} bajtů.</span>',
    calibrCompl: "Kalibrace LED ukončena.",
    colorCheck: "Kontrola pořadí barev",
    LEDlit:
      "LED by nyní měla svítit <b style='color:red;'>červeně</b>. Jakou barvu vidíte?",
    LEDcalibr: "Kalibrace stavové LED",
    litRed: "🔴 Svítí červeně",
    litGreen: "🟢 Svítí zeleně",
    brSet: "Nastavení jasu",
    brghtnss: "Jas (0–100 %):",
    adjShade: "Nastavení odstínu žluté",
    redRatio: "Podíl červené v poměru R:G (0–100 %):",
    saveBtn: "Použít nastavené hodnoty",
    ledStatus: "Stavová RGB LED",
    ledSettings: "Nastavení RGB LED",
    brYelCal: "Nastavení jasu a kalibrace žluté",
    calibrLED: "🎨 Kalibrovat LED",
    rgbLabel:
      "Needitovatelný souhrn nastavení RGB LED. Zahrnuje typ LED (RGB/GRB), jas (v procentech) a procento červené složky použité k vytvoření žluté barvy. Hodnoty lze upravit pouze v dialogovém okně, které se zobrazí po kliknutí na tlačítko 🎨 Kalibrovat LED.",
    ledCal:
      "Po stisknutí tohoto tlačítka se otevře dialogové okno. V něm lze nastavit typ led (RGB/GRB), úroveň jasu (v procentech) a podíl červené složky na složení žluté barvy (v procentech).",
  },
};
let currentLang = "en";

function changeLanguage(lang) {
  currentLang = lang;

  // Change language buttons EN/CS/..
  const btnEn = document.getElementById("btn-en");
  const btnCs = document.getElementById("btn-cs");
  if (btnEn)
    btnEn.className = lang === "en" ? "lang-btn font-bold" : "lang-btn";
  if (btnCs)
    btnCs.className = lang === "cs" ? "lang-btn font-bold" : "lang-btn";

  // Translation of all elements with a data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach((elem) => {
    const key = elem.getAttribute("data-i18n");
    if (translations[lang] && translations[lang][key]) {
      // Using innerHTML instead of textContent will allow functional links inside "req3" key
      elem.innerHTML = translations[lang][key];
    }
  });

  // SAFE PLACEHOLDER CHANGE (Script failure safeguard)
  const inputSsid = document.getElementById("input-ssid");
  if (inputSsid) {
    inputSsid.placeholder = lang === "en" ? "MyHomeWiFi" : "MojeHomeWiFi";
  }

  const inputStationName = document.getElementById("input-station-name");
  if (inputStationName) {
    inputStationName.placeholder =
      lang === "en" ? "Station Name" : "Radiožurnál";
  }

  // Updating help content with active links (including HTML tags)
  const tipNtp = document.getElementById("tip-ntp");
  if (tipNtp && translations[lang].tipNtpText) {
    tipNtp.innerHTML = translations[lang].tipNtpText;
  }

  const tipTz = document.getElementById("tip-tz");
  if (tipTz && translations[lang].tipTzText) {
    tipTz.innerHTML = translations[lang].tipTzText;
  }
}
