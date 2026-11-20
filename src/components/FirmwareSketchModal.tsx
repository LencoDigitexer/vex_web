import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

interface FirmwareSketchModalProps {
  open: boolean;
  onClose: () => void;
}

const ESP32_WIFI_SKETCH = `#include <WiFi.h>
#include <ESPmDNS.h>
#include <WebSocketsServer.h> // Библиотека Links2004/arduinoWebSockets

// Встроенная ESP32: Wi-Fi POISK_LAN <-> Serial2 (Mega2560)
// БЕЗ Bluetooth!
const char* WIFI_SSID = "POISK_LAN";
const char* WIFI_PASS = ""; // Укажите пароль от POISK_LAN (или "" если открытая)

#define RXD2 16
#define TXD2 17

WebSocketsServer webSocket = WebSocketsServer(81);
String serial2Buf = "";

void onWebSocketEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  if (type == WStype_CONNECTED) {
    IPAddress ip = webSocket.remoteIP(num);
    Serial.printf("[WS] PC connected: %s\\n", ip.toString().c_str());
    webSocket.sendTXT(num, "[ESP32] Connected on POISK_LAN -> Mega2560 Serial2");
  } else if (type == WStype_TEXT) {
    // Пересылаем команду от ПК напрямую в Mega2560 через Serial2
    Serial2.write(payload, length);
    if (length > 0 && payload[length - 1] != '\\n') {
      Serial2.write('\\n');
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(115200, SERIAL_8N1, RXD2, TXD2);

  WiFi.mode(WIFI_STA);
  if (strlen(WIFI_PASS) > 0) {
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  } else {
    WiFi.begin(WIFI_SSID);
  }

  Serial.print("Connecting to POISK_LAN");
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());

  if (MDNS.begin("brobot")) {
    Serial.println("mDNS active: ws://brobot.local:81");
  }

  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);
}

void loop() {
  webSocket.loop();

  // Читаем телеметрию от Mega2560 (Serial2) и отправляем всем ПК в WebSocket
  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\\n') {
      serial2Buf.trim();
      if (serial2Buf.length() > 0) {
        webSocket.broadcastTXT(serial2Buf);
      }
      serial2Buf = "";
    } else {
      serial2Buf += c;
    }
  }
}`;

const MEGA2560_SKETCH = `#include <Vex5.h>

// bro_bot: Arduino Mega2560 (Моторы VexV5 + Датчики) <-> Serial2 (ESP32 Wi-Fi POISK_LAN)
#define BAUDRATE         (500000)
#define SPI_NSS_PIN      (-1)
#define IS_RESET_SHIELD  (0)

Vex5_Motor motorRight;    // VEX5_PORT_1 - правое колесо
Vex5_Motor motorLeft;     // VEX5_PORT_6 - левое колесо
Vex5_Distance distSensor; // VEX5_PORT_2
Vex5_Optical optSensor;   // VEX5_PORT_7

String cmdLine = "";
unsigned long lastTelemetryMs = 0;

void setup() {
  Serial.begin(115200);   // Отладка по USB
  Serial2.begin(115200);  // Связь с ESP32 (Wi-Fi POISK_LAN)
  Vex5.begin(BAUDRATE, SPI_NSS_PIN, IS_RESET_SHIELD);

  motorRight.begin(VEX5_PORT_1);
  motorLeft.begin(VEX5_PORT_6);
  motorRight.resetEncoder();
  motorLeft.resetEncoder();

  distSensor.begin(VEX5_PORT_2);
  optSensor.begin(VEX5_PORT_7);
  Serial2.println("[Mega2560] VexV5 Ready");
}

void handleCommand(String line) {
  line.trim();
  if (line.length() == 0) return;

  if (line.startsWith("speed ")) {
    int sp = line.indexOf(' ', 6);
    if (sp > 6) {
      int16_t leftSpd = line.substring(6, sp).toInt();
      int16_t rightSpd = line.substring(sp + 1).toInt();
      motorLeft.setSpeed(leftSpd);
      motorRight.setSpeed(rightSpd);
    }
  } else if (line == "stop") {
    motorLeft.setSpeed(0);
    motorRight.setSpeed(0);
  } else if (line.startsWith("pos ")) {
    int s1 = line.indexOf(' ', 4);
    int s2 = line.indexOf(' ', s1 + 1);
    if (s1 > 4 && s2 > s1) {
      String side = line.substring(4, s1);
      int32_t deg = line.substring(s1 + 1, s2).toInt();
      int16_t maxSpd = line.substring(s2 + 1).toInt();
      int32_t ticks = Vex5.deg_to_ticks(deg);
      if (side == "left" || side == "both") motorLeft.setPosition(ticks, maxSpd);
      if (side == "right" || side == "both") motorRight.setPosition(ticks, maxSpd);
    }
  } else if (line.startsWith("maxcur ")) {
    int s1 = line.indexOf(' ', 7);
    if (s1 > 7) {
      String side = line.substring(7, s1);
      int16_t ma = line.substring(s1 + 1).toInt();
      if (side == "left" || side == "both") motorLeft.setMaxCurrent(ma);
      if (side == "right" || side == "both") motorRight.setMaxCurrent(ma);
    }
  } else if (line.startsWith("reset ")) {
    String side = line.substring(6);
    if (side == "left" || side == "both") motorLeft.resetEncoder();
    if (side == "right" || side == "both") motorRight.resetEncoder();
  } else if (line.startsWith("led ")) {
    optSensor.setLed(line.substring(4).toInt());
  }
  Serial.println("[CMD] " + line);
}

void loop() {
  while (Serial2.available()) {
    char c = (char)Serial2.read();
    if (c == '\\n') {
      handleCommand(cmdLine);
      cmdLine = "";
    } else {
      cmdLine += c;
    }
  }

  if (millis() - lastTelemetryMs > 250) {
    lastTelemetryMs = millis();
    int16_t spdL = 0, spdR = 0, pwrL = 0, pwrR = 0, distMm = 0;
    int32_t posL = 0, posR = 0;
    motorLeft.getSpeed(spdL);
    motorLeft.getPosition(posL);
    motorLeft.getPower(pwrL);
    motorRight.getSpeed(spdR);
    motorRight.getPosition(posR);
    motorRight.getPower(pwrR);
    distSensor.getValue(distMm);

    Serial2.println("TELEM L(" + String(posL) + "," + String(spdL) + "," + String(pwrL) +
                    ") R(" + String(posR) + "," + String(spdR) + "," + String(pwrR) +
                    ") DIST=" + String(distMm));
  }
}`;

export const FirmwareSketchModal: React.FC<FirmwareSketchModalProps> = ({ open, onClose }) => {
  const [tab, setTab] = useState<'esp32' | 'mega'>('esp32');
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const activeCode = tab === 'esp32' ? ESP32_WIFI_SKETCH : MEGA2560_SKETCH;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activeCode);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-3xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-800">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Прошивки робота: ESP32 (Wi-Fi POISK_LAN) + Mega2560 (VexV5)
            </h3>
            <p className="text-xs text-slate-400">
              Bluetooth удалён — ESP32 подключается к Wi-Fi POISK_LAN и общается с Mega2560 по Serial2
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Скопировано' : 'Копировать код'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-1 px-4 pt-3 bg-slate-950 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setTab('esp32')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-t border-x ${
              tab === 'esp32'
                ? 'bg-slate-900 border-slate-700 text-sky-400'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. ESP32_WiFi_POISK_LAN.ino
          </button>
          <button
            type="button"
            onClick={() => setTab('mega')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-t border-x ${
              tab === 'mega'
                ? 'bg-slate-900 border-slate-700 text-emerald-400'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            2. Mega2560_VexV5.ino
          </button>
        </div>

        <pre className="p-4 max-h-[65vh] overflow-auto bg-slate-950 text-xs font-mono text-emerald-300 leading-relaxed">
          {activeCode}
        </pre>
      </div>
    </div>
  );
};
