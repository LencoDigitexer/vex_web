import React, { useState } from 'react';
import { Check, Copy, X } from 'lucide-react';

interface FirmwareSketchModalProps {
  open: boolean;
  onClose: () => void;
}

const ESP32_WIFI_SKETCH = `#include <WiFi.h>
#include <ESPmDNS.h>

// Встроенная ESP-WROOM-32 на плате КПМИС (Vex V5 Arduino Shield)
// БЕЗ сторонних библиотек — только встроенные WiFi.h и ESPmDNS.h!
// ВАЖНО ПО АППАРАТНОЙ ЧАСТИ КПМИС:
//   - Переключатель в положении USB: прошивка ESP32 и просмотр Serial Monitor (115200).
//   - Переключатель в положении MCU: ESP32 Serial (RX0/TX0) соединяется с Mega2560 Serial2!

const char* WIFI_SSID = "POISK_LAN";
const char* WIFI_PASS = ""; // Укажите пароль от POISK_LAN (или "" если сеть открытая)

WiFiServer tcpServer(8080); // Порт для постоянного TCP-моста с ноутбуком (server.ts)
WiFiServer httpServer(80);  // Порт 80 для HTTP команд / статуса в браузере
WiFiClient tcpClient;

String uartLine = "";

void setup() {
  // На шилде КПМИС при положении MCU порт Serial (UART0) подключён к Mega2560 Serial2!
  Serial.begin(115200);
  delay(100);

  WiFi.mode(WIFI_STA);
  if (strlen(WIFI_PASS) > 0) {
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  } else {
    WiFi.begin(WIFI_SSID);
  }

  Serial.print("Connecting to POISK_LAN");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());

  if (MDNS.begin("brobot")) {
    Serial.println("mDNS: brobot.local");
  }

  tcpServer.begin();
  httpServer.begin();
}

void loop() {
  // 1) Принимаем новое TCP-подключение от ноутбука (порт 8080)
  WiFiClient newClient = tcpServer.available();
  if (newClient) {
    if (tcpClient) tcpClient.stop();
    tcpClient = newClient;
    tcpClient.println("[ESP32] Connected on POISK_LAN -> Mega2560 Serial2 (115200)");
  }

  // 2) Читаем команды из TCP от ПК -> отправляем в Mega2560 по Serial
  if (tcpClient && tcpClient.connected()) {
    while (tcpClient.available()) {
      char c = (char)tcpClient.read();
      Serial.write(c);
    }
  }

  // 3) Читаем телеметрию от Mega2560 (Serial2 -> ESP32 Serial) -> отправляем на ПК по TCP
  while (Serial.available()) {
    char c = (char)Serial.read();
    if (c == '\\n') {
      uartLine.trim();
      if (uartLine.length() > 0 && tcpClient && tcpClient.connected()) {
        tcpClient.println(uartLine);
      }
      uartLine = "";
    } else if (c != '\\r') {
      uartLine += c;
    }
  }

  // 4) Дополнительно: простые HTTP-команды на порт 80 (http://<IP>/cmd?c=stop)
  WiFiClient http = httpServer.available();
  if (http) {
    String req = http.readStringUntil('\\r');
    http.readStringUntil('\\n');
    while (http.available()) http.read();

    int idx = req.indexOf("/cmd?c=");
    if (idx >= 0) {
      int sp = req.indexOf(' ', idx);
      String cmd = (sp > idx) ? req.substring(idx + 7, sp) : req.substring(idx + 7);
      cmd.replace("%20", " ");
      Serial.println(cmd);
    }

    http.println("HTTP/1.1 200 OK");
    http.println("Access-Control-Allow-Origin: *");
    http.println("Content-Type: text/plain");
    http.println("Connection: close");
    http.println();
    http.println("OK");
    delay(1);
    http.stop();
  }
}`;

const MEGA2560_SKETCH = `#include <Vex5.h>

// bro_bot: Arduino Mega2560 (КПМИС Vex V5 Shield)
// Переключатель ESP32 на шилде должен стоять в положении MCU!
// Тогда Serial2 на Mega2560 напрямую соединён с ESP32 Serial (115200 бод).
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
  Serial.begin(115200);   // Отладка по USB компьютера
  Serial2.begin(115200);  // Связь со встроенной ESP32 (переключатель = MCU)
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
    } else if (c != '\\r') {
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
              Прошивки КПМИС (Vex V5 Shield): ESP-WROOM-32 + Mega2560
            </h3>
            <p className="text-xs text-slate-400">
              Стандартные библиотеки WiFi.h + ESPmDNS.h · Связь ESP32 Serial ↔ Mega2560 Serial2
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

        <div className="px-4 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-[11px] text-amber-200 space-y-1">
          <div>
            <strong>Как прошить ESP32 на шилде КПМИС:</strong> Плата{' '}
            <span className="font-mono">ESP32 Dev Module</span>, переключатель в{' '}
            <span className="font-mono font-semibold">USB</span> → при{' '}
            <span className="font-mono">Connecting...</span> зажать <strong>Boot + Reset</strong> на
            2–3 сек → отпустить <strong>Reset</strong>, затем <strong>Boot</strong>.
          </div>
          <div>
            <strong>Запуск с роботом:</strong> выключить/включить питание, посмотреть IP в Serial
            Monitor (115200), затем перевести переключатель в{' '}
            <span className="font-mono font-semibold">MCU</span>!
          </div>
        </div>

        <div className="flex gap-1 px-4 pt-2.5 bg-slate-950 border-b border-slate-800">
          <button
            type="button"
            onClick={() => setTab('esp32')}
            className={`px-3 py-1.5 text-xs font-medium rounded-t-lg border-t border-x ${
              tab === 'esp32'
                ? 'bg-slate-900 border-slate-700 text-sky-400'
                : 'bg-transparent border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            1. ESP32_POISK_LAN.ino (WiFi.h)
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
            2. Mega2560_VexV5.ino (Serial2)
          </button>
        </div>

        <pre className="p-4 max-h-[58vh] overflow-auto bg-slate-950 text-xs font-mono text-emerald-300 leading-relaxed">
          {activeCode}
        </pre>
      </div>
    </div>
  );
};
