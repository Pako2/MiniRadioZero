#define MYSTR(A) #A
#define STRINGIFY(A) MYSTR(A)

#include "Arduino.h"
#include "WiFi.h"
#include "ArduinoOTA.h"
#include "Audio.h"
#include <ESPmDNS.h>
#include <NetBIOS.h>
#include <Adafruit_NeoPixel.h>
#include <LittleFS.h>
#include <ArduinoJson.h>
#include <time.h>
#include "esp_log.h"
#include "esp_sntp.h"
#include "esp_heap_caps.h"
// #include <stdio.h>
// #include <stdlib.h>

#define FSIF true // Format LittleFS if not existing
#define MAXPRESETS 16
#define MAXWLANS 8
#define MAXSCHEDULES 32
#define PIN_LED_RGB 21

// I2S GPIO
#define I2S_DOUT 2
#define I2S_BCLK 3
#define I2S_LRC 4

// Rotary encoder GPIO
#define CLK_PIN 10 // GPIO connected to CLK of rotary encoder
#define DT_PIN 9   // GPIO connected to DT of rotary encoder
#define SW_PIN 7   // GPIO connected to SW of rotary encoder
#define VIRTUALGND true
#if VIRTUALGND
#define ENC_GND 8 // GPIO connected to GND of rotary encoder
#endif

const char *TAG = "main"; // For debug lines

const uint32_t GREEN = Adafruit_NeoPixel::Color(0, 150, 0);
const uint32_t RED = Adafruit_NeoPixel::Color(150, 0, 0);
const uint32_t BLUE = Adafruit_NeoPixel::Color(0, 0, 150);
const uint32_t YELLOW = Adafruit_NeoPixel::Color(150, 35, 0);
const uint32_t PURPLE = Adafruit_NeoPixel::Color(150, 0, 150);
const uint32_t CYAN = Adafruit_NeoPixel::Color(0, 150, 150);
const uint32_t WHITE = Adafruit_NeoPixel::Color(150, 150, 150);

struct PRESET
{
  char name[32];
  char url[96];
};

struct SCHEDULE
{
  uint16_t minutes;
  char wdays[9];
  uint8_t station;
};

struct WLAN
{
  char name[17];
  uint8_t bssid[6];
  char pass[33];
  char ssid[33];
  uint8_t dhcp;
  IPAddress ipaddress;
  IPAddress subnet;
  IPAddress dnsadd;
  IPAddress gateway;
};

enum mode_wifi
{
  WF_NONE,
  WF_AP,
  WF_APDEF,
  WF_STA,
  WF_WAITSTA
};
mode_wifi WF_MODE = WF_NONE;

// Global variables
char ntpServer[24] = "pool.ntp.org";
int ntpInterval = 15;
char timeZone[40] = "CET-1CEST,M3.5.0,M10.5.0/3";
char tzname_[24] = "Europe/Prague";
bool reconnect = false;
bool rcnnct = false;
bool scanfinished = false;
uint8_t scanmode = 0;
uint8_t PRESETSNUM;
const uint16_t otaport = 3232;
struct PRESET *presets;
struct WLAN *wlans;
struct SCHEDULE *schedules;
uint8_t schedulesnum = 0;
uint8_t wlannum = 0;
int8_t currstat = 255; // Selected preset
bool gotIP = false;
bool gotTime = false;
bool start = true;
int8_t validschedule = 127;
int8_t oldschedule = 126;
uint32_t delay_ = 0;
uint8_t reqvol = 50; // volume
uint8_t defstat;     // Default station (<- tripleclick)
char hostname[24] = "MiniRadioZero";
bool muteflag = false;    // Mute output
hw_timer_t *timer = NULL; // For timer
struct tm timeinfo;       // Will be filled by NTP server
time_t now;
struct tm timfo;
int8_t count5sec = 0;   // Counter for activate 5 seconds process;
bool tim5s_req = false; // Set time requested
int16_t nets;
bool sched_enabled = true;
bool unmute = false;
bool unmute_ = false;
uint32_t oldtime = 0;      // Time in millis previous interrupt
bool sw_state;             // True is pushed (LOW)
int16_t eqcount = 0;       // Counter for equal number of clicks
int16_t oldclickcount = 0; // To detect difference
bool shouldReboot = false; // After longclick

// Rotary encoder stuff
uint16_t clickcount = 0;     // Incremented per encoder click
int16_t rotationcount = 0;   // Current position of rotary switch
uint16_t enc_inactivity = 0; // Time inactive
bool singleclick = false;    // True if single click detected
bool doubleclick = false;    // True if double click detected
bool tripleclick = false;    // True if triple click detected
bool longclick = false;      // True if longclick detected

#define DIR_CW 0x10  // Clockwise step.
#define DIR_CCW 0x20 // Anti-clockwise step.
#define R_START 0x0
#define F_CW_FINAL 0x1
#define F_CW_BEGIN 0x2
#define F_CW_NEXT 0x3
#define F_CCW_BEGIN 0x4
#define F_CCW_FINAL 0x5
#define F_CCW_NEXT 0x6
uint8_t table_state; ///< Internal state
const uint8_t _ttable_full[7][4] = {
    // 00        01           10           11              // BA
    {R_START, F_CW_BEGIN, F_CCW_BEGIN, R_START},           // R_START
    {F_CW_NEXT, R_START, F_CW_FINAL, R_START | DIR_CW},    // F_CW_FINAL
    {F_CW_NEXT, F_CW_BEGIN, R_START, R_START},             // F_CW_BEGIN
    {F_CW_NEXT, F_CW_BEGIN, F_CW_FINAL, R_START},          // F_CW_NEXT
    {F_CCW_NEXT, R_START, F_CCW_BEGIN, R_START},           // F_CCW_BEGIN
    {F_CCW_NEXT, F_CCW_FINAL, R_START, R_START | DIR_CCW}, // F_CCW_FINAL
    {F_CCW_NEXT, F_CCW_FINAL, F_CCW_BEGIN, R_START},       // F_CCW_NEXT
};

enum enc_menu_t
{
  VOLUME,
  PRESET
}; // State for rotary encoder menu
enc_menu_t enc_menu_mode = VOLUME; // Default is VOLUME mode

Adafruit_NeoPixel led(1, PIN_LED_RGB, NEO_RGB + NEO_KHZ800);
Audio audio;

// Forward declaration
void WiFiEvent(WiFiEvent_t, arduino_event_info_t);

char *cpycharar(char *destination, const char *source, size_t num)
{
  destination[0] = '\0';
  return strncat(destination, source, num);
}

//**************************************************************************************************
//                                          I S R _ E N C _ S W I T C H                            *
//**************************************************************************************************
// Interrupts received from rotary encoder switch                                                  *
//**************************************************************************************************
void IRAM_ATTR isr_enc_switch()
{
  bool newstate;    // Current state of input signal
  uint32_t newtime; // Current timestamp
  uint32_t dtime;   // Time difference with previous interrupt

  newstate = (digitalRead(SW_PIN) == LOW);
  newtime = xTaskGetTickCount();        // Time of last interrupt
  dtime = (newtime - oldtime) & 0xFFFF; // Compute delta
  if (dtime < 50)                       // Debounce
  {
    return; // Ignore bouncing
  }
  if (newstate != sw_state) // State changed?
  {
    oldtime = newtime;   // Time of change for next compare
    sw_state = newstate; // Yes, set current (new) state
    if (!sw_state)       // SW released?
    {
      if ((dtime) > 2000) // More than 2 second?
      {
        longclick = true; // Yes, register longclick
        clickcount = 0;   // Forget normal count
      }
      else
      {
        clickcount++; // Yes, click detected
      }
      enc_inactivity = 0; // Not inactive anymore
    }
  }
}

//**************************************************************************************************
//                                          I S R _ E N C _ T U R N                                *
//**************************************************************************************************
// Interrupts received from rotary encoder (clk signal) knob turn.                                 *
// The encoder is a Manchester coded device, the outcomes (-1,0,1) of all the previous state and   *
// actual state are stored in the enc_states[].                                                    *
// Full_status is a 4 bit variable, the upper 2 bits are the previous encoder values, the lower    *
// ones are the actual ones.                                                                       *
// 4 bits cover all the possible previous and actual states of the 2 PINs, so this variable is     *
// the index enc_states[].                                                                         *
// No debouncing is needed, because only the valid states produce values different from 0.         *
// Rotation is 4 if position is moved from one fixed position to the next, so it is devided by 4.  *
//**************************************************************************************************
void IRAM_ATTR isr_enc_turn()
{
  // Get state of input pins.
  uint8_t pin_state = (digitalRead(CLK_PIN) << 1) +
                      digitalRead(DT_PIN);
  // Determine new state from the pins and state table.
  table_state = _ttable_full[table_state & 0xf][pin_state];

  // Return emit bits, i.e. the generated event.
  uint8_t event = table_state & 0x30;
  switch (event)
  {
  case DIR_CW:
    rotationcount++;
    break;
  case DIR_CCW:
    rotationcount--;
    break;
  default:
    break;
  }
  enc_inactivity = 0; // Mark activity
}

//**************************************************************************************************
//                                          T I M E R 1 0 0                                        *
//**************************************************************************************************
// Called every 100 msec on interrupt level, so must be in IRAM and no lengthy operations          *
// allowed.                                                                                        *
//**************************************************************************************************
void IRAM_ATTR isr_timer100()
{
  // Handle rotary encoder. Inactivity counter will be reset by encoder interrupt
  if (enc_inactivity < 36000) // Count inactivity time, but limit to 36000
  {
    enc_inactivity++;
  }

  // Now detection of single/double/triple click of rotary encoder
  if (clickcount) // Any click?
  {
    if (oldclickcount == clickcount) // Yes, stable situation?
    {
      if (++eqcount == 6) // Long time stable?
      {
        eqcount = 0;
        if (clickcount == 2) // Double click?
        {
          doubleclick = true; // Yes, set result
        }
        else if (clickcount == 3) // Triple click?
        {
          tripleclick = true; // Yes, set result
        }
        else
        {
          singleclick = true; // Just one click seen
        }
        clickcount = 0; // Reset number of clicks
      }
    }
    else
    {
      oldclickcount = clickcount; // To detect change
      eqcount = 0;                // Not stable, reset count
    }
  }
  if (++count5sec == 50) // 5 seconds passed?
  {
    tim5s_req = true; // Yes, do 5 second procedure
    count5sec = 0;    // Reset count
  }
}

//**************************************************************************************************
//                                           C H K _ E N C                                         *
//**************************************************************************************************
// See if rotary encoder is activated and perform its functions.                                   *
//**************************************************************************************************
void chk_enc()
{
  if (enc_menu_mode != VOLUME) // In default mode?
  {
    if (enc_inactivity > 50) // No, more than 5 seconds inactive
    {
      enc_inactivity = 0;
      enc_menu_mode = VOLUME; // Return to VOLUME mode
      led.setPixelColor(0, GREEN);
      led.show();
      ESP_LOGI(TAG, "Encoder mode back to VOLUME");
    }
  }

  if (singleclick || doubleclick || tripleclick || longclick || (rotationcount != 0)) // Any activity
  {
  }
  else
  {
    return; // No, nothing to do
  }

  if (tripleclick) // Handle the tripleclick
  {
    ESP_LOGI(TAG, "Triple click");
    tripleclick = false;
    currstat = defstat;
    led.setPixelColor(0, PURPLE);
    led.show();
    delay_ = millis(); // RESET to default radio station !
  }
  if (doubleclick) // Handle the doubleclick
  {
    ESP_LOGI(TAG, "Double click");
    doubleclick = false;
    enc_menu_mode = PRESET; // Swich to PRESET mode
    led.setPixelColor(0, BLUE);
    led.show();
    ESP_LOGI(TAG, "Encoder mode set to PRESET");
  }
  if (singleclick)
  {
    ESP_LOGI(TAG, "Single click");
    singleclick = false;
    switch (enc_menu_mode) // Which mode (VOLUME, PRESET)?
    {
    case VOLUME:
      muteflag = !muteflag; // Mute/unmute REQUEST
      ESP_LOGI(TAG, "Mute set to %d", muteflag);
      if (muteflag)
      {
        audio.setVolume(0);
        led.setPixelColor(0, RED);
        led.show();
      }
      else
      {
        audio.setVolume(reqvol);
        led.setPixelColor(0, GREEN);
        led.show();
      }
      break;
    case PRESET:
      ESP_LOGI(TAG, "I am tuning to station \"%s\"", presets[currstat].name);
      audio.connecttohost(presets[currstat].url);
      enc_menu_mode = VOLUME; // Back to default mode
      if (muteflag)
      {
        muteflag = false;
        audio.setVolume(reqvol);
      }
      led.setPixelColor(0, GREEN);
      led.show();
      break;
    default:
      break;
    }
  }
  if (longclick) // Check for long click
  {
    ESP_LOGI(TAG, "Long click");
    shouldReboot = true;
    longclick = false; // Reset condition
  }
  if (rotationcount == 0) // Any rotation?
  {
    return; // No, return
  }
  ESP_LOGI(TAG, "Rotation count %d", rotationcount);
  switch (enc_menu_mode) // Which mode (VOLUME, PRESET)?
  {
  case VOLUME:
    rotationcount *= 4;               // Step by 4 percent
    if ((reqvol + rotationcount) < 0) // Limit volume
    {
      reqvol = 0; // Limit to normal values
    }
    else if ((reqvol + rotationcount) > 99)
    {
      reqvol = 99; // Limit to normal values
    }
    else
    {
      reqvol += rotationcount;
    }
    ESP_LOGI(TAG, "reqvol = %d", reqvol);
    audio.setVolume(reqvol);
    if (muteflag)
    {
      led.setPixelColor(0, GREEN);
      led.show();
    }
    muteflag = false; // Mute off
    break;

  case PRESET:
    if ((currstat + rotationcount) < 0) // Limit
    {
      currstat = PRESETSNUM - 1; // Limit to normal values
    }
    else if ((currstat + rotationcount) >= PRESETSNUM)
    {
      currstat = 0; // Limit to normal values
    }
    else
    {
      currstat += rotationcount;
    }
    //;
    break;
  default:
    break;
  }
  rotationcount = 0; // Reset
}

// I2S AUDIO CALLBACK
void audio_info(Audio::msg_t m)
{
  Serial.printf("I2S AUDIO CALLBACK        %s: %s\n", m.s, m.msg);
}

bool compareBSSID(const uint8_t *val1, uint8_t val2[6])
{
  for (byte i = 0; i < 6; i++)
  {
    if (*(val1 + i) != val2[i])
    {
      return false;
    }
  }
  return true;
}

bool isZero(uint8_t arr[6])
{
  for (uint8_t i = 0; i < 6; i++)
  {
    if (arr[i] != 0)
    {
      return false;
    }
  }
  return true;
}

void findWifi(bool async)
{
  IPAddress zeroaddr(0, 0, 0, 0);
  WiFi.config(zeroaddr, zeroaddr, zeroaddr); // reset static addres (issue reconnect from static to DHCP)
  WiFi.disconnect(true, true);
  WiFi.persistent(false);
  WiFi.mode(WIFI_OFF);
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostname); // define hostname
  scanmode = (uint8_t)async;
  WiFi.scanNetworks(async, true); // async, show hidden
}

bool wifiFound()
{
  bool wififound = false;
  if (nets == 0)
  {
    ESP_LOGW(TAG, "No networks found");
  }
  else
  {
    int n = nets;
    int indices[n];
    int skip[n];
    for (int i = 0; i < nets; i++)
    {
      indices[i] = i;
    }
    for (int i = 0; i < nets; i++) // sort by RSSI
    {
      for (int j = i + 1; j < nets; j++)
      {
        if (WiFi.RSSI(indices[j]) > WiFi.RSSI(indices[i]))
        {
          std::swap(indices[i], indices[j]);
          std::swap(skip[i], skip[j]);
        }
      }
    }
    for (int i = 0; i < nets; i++)
    {
      ESP_LOGI(TAG, "WLAN %2i: %s", i + 1, WiFi.SSID(indices[i]).c_str());
    }
    for (int i = 0; i < nets; i++)
    {
      const uint8_t *ibssid = WiFi.BSSID(indices[i]);
      for (uint8_t j = 0; j < wlannum; j++)
      {
        if (WiFi.SSID(indices[i]) == wlans[j].ssid)
        {
          if (isZero(wlans[j].bssid)) // the value of bssid does not matter
          {
            ESP_LOGI(TAG, "Best WLAN found: %s", wlans[j].name);
            if (wlans[j].dhcp == 0)
            {
              if (!WiFi.config(wlans[j].ipaddress, wlans[j].gateway, wlans[j].subnet, wlans[j].dnsadd, (uint32_t)0))
              {
                ESP_LOGW(TAG, "STA Failed to configure !");
              }
            }
            WiFi.begin(wlans[j].ssid, wlans[j].pass);
#ifdef SETTXPOWER
            WiFi.setTxPower(WIFI_POWER_8_5dBm);
#endif
            wififound = true;
            i = nets; // break for outer loop
            break;
          }
          else if (compareBSSID(ibssid, wlans[j].bssid)) // bssid must be the same as entered
          {
            ESP_LOGI(TAG, "Best WLAN found: %s", wlans[j].name);
            if (wlans[j].dhcp == 0)
            {
              if (!WiFi.config(wlans[j].ipaddress, wlans[j].gateway, wlans[j].subnet, wlans[j].dnsadd, (uint32_t)0))
              {
                ESP_LOGW(TAG, "STA Failed to configure !");
              }
            }
            WiFi.begin(wlans[j].ssid, wlans[j].pass, WiFi.channel(indices[i]), wlans[j].bssid);
#ifdef SETTXPOWER
            WiFi.setTxPower(WIFI_POWER_8_5dBm);
#endif
            wififound = true;
            i = nets; // break for outer loop
            break;
          }
        }
        else if ((WiFi.SSID(indices[i]) == "") && (compareBSSID(ibssid, wlans[j].bssid)))
        {
          ESP_LOGI(TAG, "Best WLAN found: %s", wlans[j].name);
          if (wlans[j].dhcp == 0)
          {
            if (!WiFi.config(wlans[j].ipaddress, wlans[j].gateway, wlans[j].subnet, wlans[j].dnsadd, (uint32_t)0))
            {
              ESP_LOGW(TAG, "STA Failed to configure !");
            }
          }
          WiFi.begin(wlans[j].ssid, wlans[j].pass, WiFi.channel(indices[i]), wlans[j].bssid);
#ifdef SETTXPOWER
          WiFi.setTxPower(WIFI_POWER_8_5dBm);
#endif
          wififound = true;
          i = nets; // break for outer loop
          break;
        }
      }
    } // for
  } // else (networksFound)
  return wififound;
  WiFi.scanDelete();
}

void startOTA()
{
  // --- ARDUINO OTA SETUP ---
  // Optional port setting (default is 3232)
  ArduinoOTA.setPort(otaport);

  // Optionally, a password for updates can be set
  // ArduinoOTA.setPassword("myPassword123");

  // Registering callbacks (optional, but great for debugging in the Serial Monitor)
  ArduinoOTA.onStart([]()
                     { ESP_LOGI(TAG, "Start %s OTA update", (ArduinoOTA.getCommand() == U_FLASH) ? "sketch" : "filesystem"); });

  ArduinoOTA.onEnd([]()
                   { ESP_LOGI(TAG, "End of OTA update."); });

  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total)
                        { ESP_LOGI(TAG, "Progress: %u%%\r", (progress / (total / 100))); });

  ArduinoOTA.onError([](ota_error_t error)
                     {
        ESP_LOGE(TAG, "Error [%u]: ", error);
        if (error == OTA_AUTH_ERROR) ESP_LOGE(TAG, "Authentication error");
        else if (error == OTA_BEGIN_ERROR) ESP_LOGE(TAG, "Transmission start error");
        else if (error == OTA_CONNECT_ERROR) ESP_LOGE(TAG, "Connection error");
        else if (error == OTA_RECEIVE_ERROR) ESP_LOGE(TAG, "Data reception error");
        else if (error == OTA_END_ERROR) ESP_LOGE(TAG, "End of transmission error"); });

  // 2. LIVE LAUNCH OF THE OTA SERVER
  ArduinoOTA.begin();
  ESP_LOGI(TAG, "OTA server is ready and listening on port %d", otaport);
}

// Callback function (gets called when time adjusts via NTP)
void timeavailable(struct timeval *t)
{
  ESP_LOGI(TAG, "Got time adjustment from NTP!");
  // Set the timezone rules right after the system receives UTC time
  unsetenv("TZ");
  setenv("TZ", timeZone, 1);
  tzset();

  // get time info:
  time(&now);
  localtime_r(&now, &timfo);
  char timeStringBuff[50]; // 50 chars should be enough
  strftime(timeStringBuff, sizeof(timeStringBuff), "%A, %B %d %Y %H:%M:%S", &timfo);
  ESP_LOGI(TAG, "%s", timeStringBuff);
  if (!gotTime)
  {
    gotTime = true;
  }
}

void check_schedules()
{
  // Guard clause: If any value is out of valid range, log warning and exit
  if (timfo.tm_wday < 0 || timfo.tm_wday > 6 ||
      timfo.tm_hour < 0 || timfo.tm_hour > 23 ||
      timfo.tm_min < 0 || timfo.tm_min > 59)
  {
    ESP_LOGW(TAG, "Invalid time data detected! Wday: %d, Hour: %d, Min: %d",
             timfo.tm_wday, timfo.tm_hour, timfo.tm_min);
    return;
  }

  uint16_t lastschedmin = 65535;
  time(&now);
  localtime_r(&now, &timfo);
  uint16_t nowmin = 60 * timfo.tm_hour + timfo.tm_min;
  char dayChar = (char)(timfo.tm_wday + '0');
  for (int8_t i = schedulesnum - 1; i > -1; i--)
  {
    uint16_t schedmin = schedules[i].minutes;
    if (lastschedmin < 65535)
    {
      if (lastschedmin != schedmin)
      {
        lastschedmin = 65535;
        break;
      }
    }
    if (nowmin >= schedmin) // Schedule found -> test of wdays
    {
      char *myPtr = strchr(schedules[i].wdays, dayChar);
      if (myPtr != NULL)
      {
        if (validschedule != i)
        {
          validschedule = i;
          ESP_LOGI(TAG, "New schedule found: station %d, time %02d:%02d, wdays %s", schedules[i].station, schedules[i].minutes / 60, schedules[i].minutes % 60, schedules[i].wdays);
        }
        break;
      }
      else
      {
        // "wdays" do not contain current "tm_wday". Setting a flag to check if there is a schedule
        // with the same time but a different range of "wdays"
        lastschedmin = schedmin;
      }
    } // test of wdays
  } // for
}

int cmpfunc(const void *a, const void *b)
{
  SCHEDULE *scheduleA = (SCHEDULE *)a;
  SCHEDULE *scheduleB = (SCHEDULE *)b;
  return ((scheduleA->minutes) - (scheduleB->minutes));
}

void setup()
{
  Audio::audio_info_callback = audio_info;
  Serial.begin(115200);
  vTaskDelay(5000 / portTICK_PERIOD_MS); // Wait for PlatformIO monitor to start
  led.begin();
  led.setPixelColor(0, YELLOW);
  led.show();
  ESP_LOGW(TAG, "=========================================================================");
  ESP_LOGI(TAG, "MiniRadioZero - VERSION %s", STRINGIFY(VERSION));
  ESP_LOGI(TAG, "ESP32 Chip model = %s Rev %d\n", ESP.getChipModel(), ESP.getChipRevision());
  timer = timerBegin(100000);                 // 100 kHz (period = 10 us)
  timerAttachInterrupt(timer, &isr_timer100); // Call timer100() on timer alarm
  timerAlarm(timer, 10000, true, 0);          // 10000us * 10 = 100ms
  pinMode(CLK_PIN, INPUT_PULLUP);
  pinMode(DT_PIN, INPUT_PULLUP);
  pinMode(SW_PIN, INPUT_PULLUP);
#if VIRTUALGND
  pinMode(ENC_GND, OUTPUT);
  digitalWrite(ENC_GND, LOW);
#endif
  attachInterrupt(CLK_PIN, isr_enc_turn, CHANGE);
  attachInterrupt(DT_PIN, isr_enc_turn, CHANGE);
  attachInterrupt(SW_PIN, isr_enc_switch, CHANGE);

  presets = (struct PRESET *)heap_caps_malloc(MAXPRESETS * sizeof(struct PRESET), MALLOC_CAP_SPIRAM);
  wlans = (WLAN *)heap_caps_malloc(MAXWLANS * sizeof(WLAN), MALLOC_CAP_SPIRAM);
  schedules = (SCHEDULE *)heap_caps_malloc(MAXSCHEDULES * sizeof(SCHEDULE), MALLOC_CAP_SPIRAM);

  if (!LittleFS.begin(FSIF)) // Mount and test LittleFS
  {
    ESP_LOGE(TAG, "LittleFS Mount Error!");
  }
  else
  {
    ESP_LOGI(TAG, "LittleFS is okay, space %d, used %d", // Show available LittleFS space
             LittleFS.totalBytes(),
             LittleFS.usedBytes());
    File config = LittleFS.open("/config.json", // Try to read from LittleFS file
                                FILE_READ);
    if (config) // Open success?
    {
      ESP_LOGI(TAG, "config.json file opened successfully !");

      size_t size = config.size();
      std::unique_ptr<char[]> buf(new char[size]);
      config.readBytes(buf.get(), size);
      config.close();

      JsonDocument json;
      auto error = deserializeJson(json, buf.get());
      if (error)
      {
        ESP_LOGW(TAG, "Failed to parse config.json file");
      }
      JsonArray radio = json["radio"];
      if (radio)
      {
        PRESETSNUM = 0;
        for (JsonObject value : radio)
        {
          if (value["name"].is<const char *>() && value["url"].is<const char *>())
          {
            cpycharar(presets[PRESETSNUM].name, value["name"].as<const char *>(), 31);
            cpycharar(presets[PRESETSNUM].url, value["url"].as<const char *>(), 95);
          }
          ESP_LOGI(TAG, "Preset [%d] is: %s", PRESETSNUM, presets[PRESETSNUM].url);
          PRESETSNUM++;
          if (PRESETSNUM >= MAXPRESETS)
          {
            break;
          }
        }
      }
      ESP_LOGI(TAG, "Number of presets: %d", PRESETSNUM);

      if (json["scheduler"]["sched_enabled"].is<int>())
      {
        sched_enabled = json["scheduler"]["sched_enabled"].as<bool>();
      }
      if (json["scheduler"]["unmute"].is<int>())
      {
        unmute = json["scheduler"]["unmute"].as<bool>();
      }

      JsonArray items = json["scheduler"]["items"];
      if (items)
      {
        schedulesnum = 0;

        for (JsonObject value : items)
        {
          // 1. Validating the existence and types of data in JSON
          if (value["station"].is<uint8_t>() &&
              value["time"].is<const char *>() &&
              value["wdays"].is<const char *>())
          {

            const char *timeStr = value["time"].as<const char *>();
            int h = 0, m = 0;

            // 2. Safe time parsing directly from string
            // sscanf returns the number of successfully parsed items (we want exactly 2)
            if (sscanf(timeStr, "%d:%d", &h, &m) == 2)
            {
              schedules[schedulesnum].minutes = (60 * h) + m;
            }
            else
            {
              // Invalid time format (e.g. missing colon) -> skip item
              continue;
            }

            // 3. Safe copying of wdays (field size is 9, we copy max 8 characters + \0)
            const char *wdaysStr = value["wdays"].as<const char *>();
            schedules[schedulesnum].wdays[0] = '\0';
            strncpy(schedules[schedulesnum].wdays, wdaysStr, 8);
            schedules[schedulesnum].wdays[8] = '\0'; // String Termination Assurance

            // 4. Save station
            schedules[schedulesnum].station = value["station"].as<uint8_t>();

            // Increment the counter ONLY if the item was successfully added
            schedulesnum++;

            // Checking the capacity overflow of the schedules field
            if (schedulesnum >= MAXSCHEDULES)
            {
              break;
            }
          }
        }
      }

      ESP_LOGI(TAG, "Number of schedules: %d", schedulesnum);
      qsort(schedules, schedulesnum, sizeof(schedules[0]), cmpfunc);
      for (uint8_t i = 0; i < schedulesnum; i++)
      {
        ESP_LOGI(TAG, "Schedule [%d]: station %d, time %02d:%02d, wdays %s", i, schedules[i].station, schedules[i].minutes / 60, schedules[i].minutes % 60, schedules[i].wdays);
      }

      JsonArray networks = json["network"];
      if (networks)
      {
        wlannum = 0;
        for (JsonObject value : networks)
        {
          if (value["location"].is<const char *>() && value["ssid"].is<const char *>() && value["wifipass"].is<const char *>() && value["wifibssid"].is<const char *>())
          {
            cpycharar(wlans[wlannum].name, value["location"].as<const char *>(), 16);
            cpycharar(wlans[wlannum].ssid, value["ssid"].as<const char *>(), 32);
            cpycharar(wlans[wlannum].pass, value["wifipass"].as<const char *>(), 32);
            //			decodeB64(value["wifipass"].as<const char *>(), wlans[wlannum].pass);
            char bssid[18];
            cpycharar(bssid, value["wifibssid"].as<const char *>(), 17);
            if (strlen(bssid) == 0)
            {
              strcat(bssid, "00:00:00:00:00:00");
            }
            sscanf(bssid, "%2hhx:%2hhx:%2hhx:%2hhx:%2hhx:%2hhx",
                   &wlans[wlannum].bssid[0], &wlans[wlannum].bssid[1],
                   &wlans[wlannum].bssid[2], &wlans[wlannum].bssid[3],
                   &wlans[wlannum].bssid[4], &wlans[wlannum].bssid[5]);
          }
          if (value["dhcp"].is<uint8_t>())
          {
            wlans[wlannum].dhcp = value["dhcp"].as<uint8_t>();
            if (wlans[wlannum].dhcp == 0)
            {
              if (value["ipaddress"].is<const char *>() && value["subnet"].is<const char *>() && value["dnsadd"].is<const char *>() && value["gateway"].is<const char *>())
              {
                wlans[wlannum].ipaddress.fromString(value["ipaddress"].as<const char *>());
                wlans[wlannum].subnet.fromString(value["subnet"].as<const char *>());
                wlans[wlannum].dnsadd.fromString(value["dnsadd"].as<const char *>());
                wlans[wlannum].gateway.fromString(value["gateway"].as<const char *>());
              }
            }
          }
          wlannum++;
          if (wlannum >= MAXWLANS)
          {
            break;
          }
        }
      }
      ESP_LOGI(TAG, "Number of wlans: %3d", wlannum);

      JsonObject ntp = json["ntp"];
      if (ntp)
      {
        if (ntp["interval"].is<int>())
        {
          ntpInterval = ntp["interval"].as<int>();
        }
        if (ntp["timezone"].is<const char *>())
        {
          cpycharar(timeZone, ntp["timezone"].as<const char *>(), 39);
        }
        if (ntp["tzname"].is<const char *>())
        {
          cpycharar(tzname_, ntp["tzname"].as<const char *>(), 23);
        }
        if (ntp["server"].is<const char *>())
        {
          cpycharar(ntpServer, ntp["server"].as<const char *>(), 23);
        }
      }
      if (json["defvol"].is<uint8_t>())
      {
        reqvol = json["defvol"].as<uint8_t>();
      }
      if (json["defstat"].is<uint8_t>())
      {
        defstat = json["defstat"].as<uint8_t>();
      }
      ESP_LOGI(TAG, "Default station: %s, %s", presets[defstat].name, presets[defstat].url);
      ESP_LOGI(TAG, "Default volume: %d", reqvol);

      if (json["hostname"].is<const char *>())
      {
        cpycharar(hostname, json["hostname"].as<const char *>(), 23);
      }
      if (wlannum > 0)
      {
        WiFi.onEvent(WiFiEvent);
        scanfinished = false;
        findWifi(false); // no async
        nets = WiFi.scanComplete();
        if (wifiFound())
        {
          while (WiFi.status() != WL_CONNECTED)
          {
            vTaskDelay(50 / portTICK_PERIOD_MS);
            Serial.print(".");
          }
          Serial.println();
          ESP_LOGI(TAG, "Initializing SNTP...");

          // 1. Set the SNTP operating mode to active polling using the modern ESP-IDF API
          esp_sntp_setoperatingmode(ESP_SNTP_OPMODE_POLL);

          // 2. Define multiple NTP servers to ensure redundancy if the primary server fails
          esp_sntp_setservername(0, ntpServer);         // Primary server from config.json (e.g., "cz.pool.ntp.org")
          esp_sntp_setservername(1, "pool.ntp.org");    // Backup server 1 (Global pool)
          esp_sntp_setservername(2, "time.google.com"); // Backup server 2 (Google NTP)

          // 4. Start the SNTP service using the modern ESP-IDF API
          esp_sntp_init();

          // 5. Wait for the time to synchronize with a timeout (max 10 seconds)
          int retry = 0;
          const int maxRetries = 20; // 20 * 500ms = 10 seconds

          // Check if system time has moved past year 1970 (Unix epoch > 1,000,000,000s)
          while (time(nullptr) < 1000000000 && retry < maxRetries)
          {
            vTaskDelay(500 / portTICK_PERIOD_MS);
            retry++;
            ESP_LOGD(TAG, "Waiting for NTP sync... (%d/%d)", retry, maxRetries);
          }

          // 6. Just log the boot sync result
          if (time(nullptr) >= 1000000000)
          {
            ESP_LOGI(TAG, "NTP Sync completed during boot.");
            unsetenv("TZ");
            setenv("TZ", timeZone, 1);
            tzset();
            time(&now);
            localtime_r(&now, &timfo);
            char timeStringBuff[50]; // 50 chars should be enough
            strftime(timeStringBuff, sizeof(timeStringBuff), "%A, %B %d %Y %H:%M:%S", &timfo);
            ESP_LOGI(TAG, "%s", timeStringBuff);
            gotTime = true;
          }
          else
          {
            ESP_LOGW(TAG, "NTP Sync timeout! Processing will continue in background.");
          }
          // 3. Set intervals and the sync notification callback
          sntp_set_sync_interval(60000 * ntpInterval);
          sntp_set_time_sync_notification_cb(timeavailable);

          timeinfo.tm_year = 0; // Set TOD to illegal
          if (!MDNS.begin(hostname))
          {
            ESP_LOGE(TAG, "Error starting mDNS");
          }
          else
          {
            ESP_LOGI(TAG, "mDNS responder started");
            // Optional: if the ESP32 is running a webserver on port 80
            // MDNS.addService("http", "tcp", 80);
          }
          NBNS.begin(hostname);
          ESP_LOGI(TAG, "NetBIOS responder started");
          startOTA();

        } // wifiFound()
        else // wifi not found
        {
          ESP_LOGW(TAG, "No known WiFi network was found !");

          WiFi.mode(WIFI_AP_STA);
          // STAmode = false;
          // IPAddress IP = config.apaddress;IPAddress zeroaddr(0, 0, 0, 0);
          IPAddress IP(192, 168, 4, 1);
          IPAddress NMask(255, 255, 255, 0);
          WiFi.softAPConfig(IP, IP, NMask);
          WiFi.softAP("MiniRadioZero");
#ifdef SETTXPOWER
          WiFi.setTxPower(WIFI_POWER_8_5dBm);
#endif
          IPAddress myIP = WiFi.softAPIP();
          ESP_LOGI(TAG, "AP IP address: \"%d.%d.%d.%d\"", myIP[0], myIP[1], myIP[2], myIP[3]);
          WF_MODE = WF_AP;
          startOTA();
          led.setPixelColor(0, WHITE);
          led.show();

        } // wifi not found
      }
    }
  }
  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolumeSteps(100);
  audio.setVolume(reqvol);

  ESP_LOGI(TAG, "SketchSize:     0x%X", ESP.getSketchSize());
  ESP_LOGI(TAG, "MaxSketchSpace: 0x%X", ESP.getFreeSketchSpace());
  ESP_LOGI(TAG, "Total PSRAM:    0x%X", ESP.getPsramSize());
  ESP_LOGI(TAG, "Free PSRAM:     0x%X", ESP.getFreePsram());
}

void loop()
{
  if (WF_MODE == WF_WAITSTA)
  {
    if (!rcnnct)
    {
      scanfinished = false;
      findWifi(true); // async
      rcnnct = true;
    }
    else
    {
      if (scanfinished)
      {
        if (!wifiFound())
        {
          rcnnct = false;
        }
        scanfinished = false;
      }
    }
  }
  if (gotIP)
  {
    WF_MODE = WF_STA;
    IPAddress ip = WiFi.localIP();
    ESP_LOGI(TAG, "IP address: \"%d.%d.%d.%d\"", ip[0], ip[1], ip[2], ip[3]);
    if (reconnect)
    {
      if (!audio.isRunning())
      {
        delay_ = millis();
      }
      reconnect = false;
    }
    gotIP = false;
  }

  if (delay_ > 0)
  {
    uint32_t now = millis();
    if ((millis() - delay_) > 2000)
    {
      if (!muteflag)
      {
        led.setPixelColor(0, GREEN);
        led.show();
      }
      else if (unmute_)
      {
        muteflag = false;
        unmute_ = false;
        audio.setVolume(reqvol);
        led.setPixelColor(0, GREEN);
        led.show();
      }
      audio.connecttohost(presets[currstat].url);
      ESP_LOGI(TAG, "I am tuning to station \"%s\"", presets[currstat].name);
      delay_ = 0;
    }
  }

  chk_enc(); // Check rotary encoder functions
  audio.loop();
  ArduinoOTA.handle();
  if (tim5s_req)
  {
    ESP_LOGI(TAG, "Free heap, free stack: %s, %d", String(ESP.getFreeHeap()), uxTaskGetStackHighWaterMark(NULL));
    if ((WF_MODE == WF_STA) && sched_enabled && gotTime)
    {
      check_schedules();
      if (validschedule != oldschedule)
      {
        if (validschedule < 127)
        {
          uint8_t stat = schedules[validschedule].station;
          if (currstat != stat)
          {
            currstat = stat;
            delay_ = millis();
            if (unmute)
            {
              unmute_ = true;
            }
            led.setPixelColor(0, BLUE);
            led.show();
          }
          else if (muteflag && unmute_)
          {
            muteflag = false;
            unmute_ = false;
            audio.setVolume(reqvol);
            led.setPixelColor(0, GREEN);
            led.show();
          }
          oldschedule = validschedule;
        }
        else
        {
          ESP_LOGW(TAG, "No valid schedule was found during the first scheduler check !");
          currstat = defstat;
          delay_ = millis();
          oldschedule = validschedule;
        }
      }
    }
    tim5s_req = false;
  }
  if (shouldReboot)
  {
    shouldReboot = false;
    ESP_LOGW(TAG, "System is going to reboot ...");
    ESP.restart();
  }
  vTaskDelay(1);
}

void WiFiEvent(WiFiEvent_t event, arduino_event_info_t info)
{
  char s[40];
  switch (event)
  {
  case ARDUINO_EVENT_WIFI_SCAN_DONE:
    cpycharar(s, "ARDUINO_EVENT_WIFI_SCAN_DONE", 34);
    if (scanmode == 1) // reconnect request
    {
      nets = WiFi.scanComplete();
      scanfinished = true;
      ESP_LOGI(TAG, "Scan complete. Number of networks found: %d", nets);
    }
    break;

  case ARDUINO_EVENT_WIFI_STA_CONNECTED:
    // STAmode = true;
    cpycharar(s, "WIFI_EVENT_STA_CONNECTED", 34);
    break;

  case ARDUINO_EVENT_WIFI_STA_GOT_IP:
    gotIP = true;
    cpycharar(s, "ARDUINO_EVENT_WIFI_STA_GOT_IP", 34);
    break;

  case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
    if (WF_MODE != WF_WAITSTA)
    {
      reconnect = true;
      rcnnct = false;
      audio.stopSong();
      WF_MODE = WF_WAITSTA;
      led.setPixelColor(0, WHITE);
      led.show();
    }
    cpycharar(s, "ARDUINO_EVENT_WIFI_STA_DISCONNECTED", 36);
    break;
  default:
    cpycharar(s, "[ UNKNOWN ]", 34);
    break;

  } // switch
  if (strcmp(s, "[ UNKNOWN ]") != 0)
  {
    ESP_LOGW(TAG, "WiFi-event: >>>%s<<< (%i)", s, (int)event);
  }
} // WiFiEvent
