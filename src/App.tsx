import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot,
  Camera,
  Check,
  Code2,
  Compass,
  Copy,
  Cpu,
  Laptop,
  Lightbulb,
  Pause,
  Play,
  QrCode,
  Radio,
  RotateCcw,
  Smartphone,
  Wifi,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { ArenaViewport } from './components/ArenaViewport';
import { FirmwareSketchModal } from './components/FirmwareSketchModal';
import { ManipulatorPanel } from './components/ManipulatorPanel';
import { MotorControlPanel } from './components/MotorControlPanel';
import { PhoneSensorView } from './components/PhoneSensorView';
import { ProtocolAndSerialPanel } from './components/ProtocolAndSerialPanel';
import type { ClientRole, PhoneGpsData, PhoneImuData } from './lib/relayTypes';
import {
  RobotSimState,
  SketchPresetId,
  createInitialSimState,
  stepSimulation,
} from './lib/robotSim';
import { getDefaultRelayUrl, useRelaySocket } from './lib/useRelaySocket';
import {
  Vex5Cmd,
  Vex5Packet,
  Vex5Port,
  buildVex5Packet,
  degToTicks,
  encodeInt16LE,
  encodeInt32LE,
} from './lib/vex5Protocol';
import { createLanRtcPeer } from './lib/webrtcPeer';

interface SerialPortLike {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  writable?: WritableStream<Uint8Array> | null;
  readable?: ReadableStream<Uint8Array> | null;
}

const PRESETS: Array<{ id: SketchPresetId; label: string; description: string }> = [
  {
    id: 'manual',
    label: 'Manual + Arm',
    description: 'Interactive differential drive & 6-DOF manipulator control',
  },
  {
    id: 'motor_position_90',
    label: 'README: +90° Step',
    description: 'Steps goalPosition by Vex5.deg_to_ticks(90) every 1000 ms',
  },
  {
    id: 'two_motors_forward_back',
    label: 'TwoMotorsForwardBack',
    description: 'Alternates {200, 300} wheel speeds forward/reverse',
  },
  {
    id: 'optical_parktronic',
    label: 'OpticalSensorParktronic',
    description: 'Autonomous obstacle avoidance using Vex5_Distance + Vex5_Optical',
  },
];

function getInitialRoleAndRoom(): { role: ClientRole; roomId: string } {
  if (typeof window === 'undefined') return { role: 'pc', roomId: 'bro_bot_1' };
  const params = new URLSearchParams(window.location.search);
  const urlRole = params.get('role');
  const urlRoom = params.get('room');
  const isMobileUa = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const role: ClientRole =
    urlRole === 'phone' || urlRole === 'pc' ? urlRole : isMobileUa ? 'phone' : 'pc';
  const roomId = urlRoom?.trim() || 'bro_bot_1';
  return { role, roomId };
}

export function App() {
  const initial = useMemo(() => getInitialRoleAndRoom(), []);
  const [role, setRole] = useState<ClientRole>(initial.role);
  const [roomId, setRoomId] = useState<string>(initial.roomId);
  const [roomInput, setRoomInput] = useState<string>(initial.roomId);
  const [customRelayUrl, setCustomRelayUrl] = useState<string>(() => getDefaultRelayUrl());

  // ESP32 Host/Port in POISK_LAN (TCP port 8080 via server.ts, or HTTP port 80 direct)
  const [espHost, setEspHost] = useState<string>(() => {
    if (typeof window === 'undefined') return 'brobot.local';
    return window.localStorage.getItem('brobot_esp32_host') || 'brobot.local';
  });
  const [espPort, setEspPort] = useState<number>(8080);

  const [showQrModal, setShowQrModal] = useState(false);
  const [showSketchModal, setShowSketchModal] = useState(false);
  const [copiedPhoneLink, setCopiedPhoneLink] = useState(false);

  // Serverless WebRTC P2P state on PC
  const [p2pOfferInput, setP2pOfferInput] = useState('');
  const [p2pAnswerCode, setP2pAnswerCode] = useState('');
  const [p2pStatus, setP2pStatus] = useState('idle');
  const [p2pGps, setP2pGps] = useState<PhoneGpsData | null>(null);
  const [p2pImu, setP2pImu] = useState<PhoneImuData | null>(null);
  const [p2pStreamActive, setP2pStreamActive] = useState(false);
  const p2pVideoRef = useRef<HTMLVideoElement | null>(null);
  const pcRtcRef = useRef<ReturnType<typeof createLanRtcPeer> | null>(null);

  const [sim, setSim] = useState<RobotSimState>(() => createInitialSimState());
  const [packets, setPackets] = useState<Vex5Packet[]>(() => [
    buildVex5Packet(
      Vex5Port.VEX5_PORT_1,
      Vex5Cmd.VEX5_CMD_MOTOR_BEGIN,
      [],
      5,
      'motor[right].begin(VEX5_PORT_1)'
    ),
    buildVex5Packet(
      Vex5Port.VEX5_PORT_6,
      Vex5Cmd.VEX5_CMD_MOTOR_BEGIN,
      [],
      5,
      'motor[left].begin(VEX5_PORT_6)'
    ),
  ]);
  const [serialLogs, setSerialLogs] = useState<string[]>([
    '[POISK_LAN] Сеть: ПК (Ubuntu) ↔ ESP32 (WiFiServer :8080) ↔ Mega2560 (Serial2, переключатель MCU)',
    '[Vex5] Vex5.begin(500000, -1, 0) · HW Version 5',
    'Укажите IP ESP32 из Serial Monitor (например 192.168.1.50) и нажмите «Подкл. Wi-Fi».',
  ]);

  const [megaTelemetryAlive, setMegaTelemetryAlive] = useState(false);
  const [localSerialConnected, setLocalSerialConnected] = useState(false);
  const serialPortRef = useRef<SerialPortLike | null>(null);
  const webSerialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const appendSerial = useCallback((lines: string[]) => {
    if (lines.length === 0) return;
    setSerialLogs((prev) => [...prev.slice(-140), ...lines]);
  }, []);

  const pushPacket = useCallback((pkt: Vex5Packet) => {
    setPackets((prev) => [pkt, ...prev].slice(0, 60));
  }, []);

  // Parse telemetry lines coming from Mega2560 -> Serial2 -> ESP32 Serial -> TCP
  const handleEsp32Lines = useCallback(
    (lines: string[]) => {
      appendSerial(lines.map((l) => `[ESP32 RX] ${l}`));
      for (const line of lines) {
        const m = line.match(
          /TELEM\s+L\((-?\d+),(-?\d+),(-?\d+)\)\s+R\((-?\d+),(-?\d+),(-?\d+)\)\s+DIST=(\d+)/
        );
        if (m) {
          setMegaTelemetryAlive(true);
          const posL = Number(m[1]);
          const spdL = Number(m[2]);
          const pwrL = Number(m[3]);
          const posR = Number(m[4]);
          const spdR = Number(m[5]);
          const pwrR = Number(m[6]);
          const distanceMm = Number(m[7]);
          setSim((prev) => ({
            ...prev,
            leftMotor: {
              ...prev.leftMotor,
              realPositionTicks: posL,
              realSpeed: spdL,
              realPower: pwrL,
            },
            rightMotor: {
              ...prev.rightMotor,
              realPositionTicks: posR,
              realSpeed: spdR,
              realPower: pwrR,
            },
            distanceSensor: { ...prev.distanceSensor, distanceMm },
          }));
        }
      }
    },
    [appendSerial]
  );

  const deviceLabel = useMemo(
    () => (role === 'phone' ? 'Android Camera/GPS' : 'Ubuntu PC Controller'),
    [role]
  );

  const relay = useRelaySocket({
    roomId,
    role,
    deviceLabel,
    customRelayUrl,
    onEsp32Rx: handleEsp32Lines,
  });

  useEffect(() => {
    return () => {
      pcRtcRef.current?.close();
    };
  }, []);

  // 20 Hz local simulation loop
  useEffect(() => {
    if (role !== 'pc') return;
    const interval = window.setInterval(() => {
      setSim((prev) => {
        const { nextState, serialLines } = stepSimulation(prev, 50);
        if (serialLines.length > 0) {
          setSerialLogs((logs) => [...logs.slice(-140), ...serialLines]);
        }
        return nextState;
      });
    }, 50);
    return () => window.clearInterval(interval);
  }, [role]);

  const sendToRobot = useCallback(
    (serialText: string) => {
      if (relay.snapshot.esp32Status.connected) {
        relay.sendEsp32Tcp(serialText);
        appendSerial([`[PC → ESP32 TCP] ${serialText}`]);
      } else if (!relay.wsConnected && espHost.trim()) {
        // Direct HTTP fallback on port 80 when running statically without server.ts
        void fetch(`http://${espHost.trim()}/cmd?c=${encodeURIComponent(serialText)}`).catch(
          () => {
            // ignore offline fallback error
          }
        );
      }

      if (localSerialConnected && serialPortRef.current?.writable) {
        const writer = serialPortRef.current.writable.getWriter();
        void writer
          .write(new TextEncoder().encode(`${serialText}\n`))
          .finally(() => writer.releaseLock());
      }
    },
    [appendSerial, espHost, localSerialConnected, relay]
  );

  const handleToggleEsp32Connect = () => {
    const cleanHost = espHost.trim() || 'brobot.local';
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('brobot_esp32_host', cleanHost);
    }

    if (relay.snapshot.esp32Status.connected) {
      relay.disconnectEsp32Tcp();
      setMegaTelemetryAlive(false);
      appendSerial(['[ESP32 TCP] Отключено']);
      return;
    }

    if (relay.wsConnected) {
      appendSerial([`[ESP32 TCP] Подключение к ${cleanHost}:${espPort} через POISK_LAN...`]);
      relay.connectEsp32Tcp(cleanHost, espPort);
    } else {
      appendSerial([
        '[ESP32] Локальный Node-сервер (server.ts) не активен. Отправляю HTTP-команды напрямую на http://' +
          cleanHost +
          '/cmd',
      ]);
    }
  };

  const handleDriveVector = useCallback(
    (leftSpeed: number, rightSpeed: number, label: string) => {
      const l = Math.round(leftSpeed);
      const r = Math.round(rightSpeed);
      setSim((prev) => ({
        ...prev,
        preset: 'manual',
        leftMotor: { ...prev.leftMotor, controlMode: 'speed', goalSpeed: l },
        rightMotor: { ...prev.rightMotor, controlMode: 'speed', goalSpeed: r },
      }));
      pushPacket(
        buildVex5Packet(
          Vex5Port.VEX5_PORT_6,
          Vex5Cmd.VEX5_CMD_MOTOR_SET_SPEED,
          encodeInt16LE(l),
          sim.hwVersion,
          `Left motor setSpeed(${l}) [${label}]`
        )
      );
      pushPacket(
        buildVex5Packet(
          Vex5Port.VEX5_PORT_1,
          Vex5Cmd.VEX5_CMD_MOTOR_SET_SPEED,
          encodeInt16LE(r),
          sim.hwVersion,
          `Right motor setSpeed(${r}) [${label}]`
        )
      );
      sendToRobot(l === 0 && r === 0 ? 'stop' : `speed ${l} ${r}`);
      appendSerial([`[Drive] ${label}: L=${l}, R=${r}`]);
    },
    [appendSerial, pushPacket, sendToRobot, sim.hwVersion]
  );

  // Keyboard WASD / Arrow drive bindings in PC mode
  useEffect(() => {
    if (role !== 'pc') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        e.preventDefault();
        handleDriveVector(260, 260, 'Key Forward');
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleDriveVector(-260, -260, 'Key Reverse');
      } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
        e.preventDefault();
        handleDriveVector(-180, 180, 'Key Turn Left');
      } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
        e.preventDefault();
        handleDriveVector(180, -180, 'Key Turn Right');
      } else if (e.key === ' ') {
        e.preventDefault();
        handleDriveVector(0, 0, 'Key Stop');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleDriveVector, role]);

  const handleSetMotorPosition = (side: 'left' | 'right', deltaDeg: number, maxSpeed: number) => {
    const deltaTicks = Math.round(degToTicks(deltaDeg));
    const port = side === 'right' ? Vex5Port.VEX5_PORT_1 : Vex5Port.VEX5_PORT_6;
    const nextTargetTicks =
      (side === 'right' ? sim.rightMotor.goalPositionTicks : sim.leftMotor.goalPositionTicks) +
      deltaTicks;

    setSim((prev) => {
      const m = side === 'right' ? prev.rightMotor : prev.leftMotor;
      const updated = {
        ...m,
        controlMode: 'position' as const,
        goalPositionTicks: m.goalPositionTicks + deltaTicks,
        maxSpeed,
      };
      return {
        ...prev,
        preset: 'manual',
        rightMotor: side === 'right' ? updated : prev.rightMotor,
        leftMotor: side === 'left' ? updated : prev.leftMotor,
      };
    });

    pushPacket(
      buildVex5Packet(
        port,
        Vex5Cmd.VEX5_CMD_MOTOR_SET_POSITION,
        [...encodeInt16LE(maxSpeed), ...encodeInt32LE(nextTargetTicks)],
        sim.hwVersion,
        `${side} setPosition(${nextTargetTicks} ticks, maxSpeed=${maxSpeed})`
      )
    );
    sendToRobot(`pos ${side} ${deltaDeg} ${maxSpeed}`);
    appendSerial([
      `[${side}] setPosition(${nextTargetTicks} ticks / ${deltaDeg > 0 ? '+' : ''}${deltaDeg}°)`,
    ]);
  };

  const handleSetMaxCurrent = (side: 'left' | 'right', maxCurrentMa: number) => {
    const port = side === 'right' ? Vex5Port.VEX5_PORT_1 : Vex5Port.VEX5_PORT_6;
    setSim((prev) => ({
      ...prev,
      rightMotor: side === 'right' ? { ...prev.rightMotor, maxCurrentMa } : prev.rightMotor,
      leftMotor: side === 'left' ? { ...prev.leftMotor, maxCurrentMa } : prev.leftMotor,
    }));
    pushPacket(
      buildVex5Packet(
        port,
        Vex5Cmd.VEX5_CMD_MOTOR_SET_MAX_CURRENT,
        encodeInt16LE(maxCurrentMa),
        sim.hwVersion,
        `${side} setMaxCurrent(${maxCurrentMa} mA)`
      )
    );
    sendToRobot(`maxcur ${side} ${maxCurrentMa}`);
    appendSerial([`[${side}] setMaxCurrent(${maxCurrentMa} mA)`]);
  };

  const handleResetEncoder = (side: 'left' | 'right') => {
    const port = side === 'right' ? Vex5Port.VEX5_PORT_1 : Vex5Port.VEX5_PORT_6;
    setSim((prev) => ({
      ...prev,
      rightMotor:
        side === 'right'
          ? { ...prev.rightMotor, realPositionTicks: 0, goalPositionTicks: 0 }
          : prev.rightMotor,
      leftMotor:
        side === 'left'
          ? { ...prev.leftMotor, realPositionTicks: 0, goalPositionTicks: 0 }
          : prev.leftMotor,
    }));
    pushPacket(
      buildVex5Packet(
        port,
        Vex5Cmd.VEX5_CMD_MOTOR_ENCODER_RESET,
        [],
        sim.hwVersion,
        `${side} resetEncoder()`
      )
    );
    sendToRobot(`reset ${side}`);
    appendSerial([`[${side}] resetEncoder() -> 0 ticks`]);
  };

  const handleSelectPreset = (preset: SketchPresetId) => {
    setSim((prev) => ({
      ...prev,
      preset,
      lastStepMs: prev.elapsedMs,
      rightMotor: { ...prev.rightMotor, goalSpeed: 0, controlMode: 'speed' },
      leftMotor: { ...prev.leftMotor, goalSpeed: 0, controlMode: 'speed' },
    }));
    appendSerial([`[Sketch] Switched active loop -> ${preset}`]);
  };

  const handleToggleOpticalLed = () => {
    const nextLed = !sim.opticalSensor.ledOn;
    setSim((prev) => ({
      ...prev,
      opticalSensor: { ...prev.opticalSensor, ledOn: nextLed },
    }));
    pushPacket(
      buildVex5Packet(
        Vex5Port.VEX5_PORT_7,
        Vex5Cmd.VEX5_CMD_OPTICAL_SET_LED,
        [nextLed ? 1 : 0],
        sim.hwVersion,
        `optical.setLed(${nextLed ? 1 : 0})`
      )
    );
    sendToRobot(`led ${nextLed ? 1 : 0}`);
    appendSerial([`[Vex5_Optical] setLed(${nextLed ? 1 : 0})`]);
  };

  const handleSendSerialCommand = async (raw: string) => {
    appendSerial([`> ${raw}`]);
    sendToRobot(raw);

    const parts = raw.trim().split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    if (cmd === 'help') {
      appendSerial([
        'Commands: speed <L> <R> | pos <left|right> <deg> <maxSpd> | stop | reset <left|right|both> | led <0|1> | status',
      ]);
    } else if (cmd === 'speed' && parts.length >= 3) {
      const l = Number(parts[1]) || 0;
      const r = Number(parts[2]) || 0;
      handleDriveVector(l, r, 'Console');
    } else if (cmd === 'stop') {
      handleDriveVector(0, 0, 'Console Stop');
    } else if (cmd === 'led' && parts.length >= 2) {
      const on = parts[1] !== '0';
      setSim((prev) => ({ ...prev, opticalSensor: { ...prev.opticalSensor, ledOn: on } }));
    } else if (cmd === 'status') {
      appendSerial([
        `Pose=(${sim.pose.x.toFixed(1)}, ${sim.pose.y.toFixed(1)}) Dist=${sim.distanceSensor.distanceMm}mm RGB=(${sim.opticalSensor.red},${sim.opticalSensor.green},${sim.opticalSensor.blue})`,
      ]);
    }
  };

  const handleToggleWebSerial = async () => {
    if (!webSerialSupported) return;
    if (localSerialConnected && serialPortRef.current) {
      try {
        await serialPortRef.current.close();
      } catch {
        // ignore
      }
      serialPortRef.current = null;
      setLocalSerialConnected(false);
      appendSerial(['[PC USB Serial] Disconnected']);
      return;
    }

    try {
      const navSerial = (navigator as unknown as {
        serial: { requestPort: () => Promise<SerialPortLike> };
      }).serial;
      const port = await navSerial.requestPort();
      await port.open({ baudRate: 115200 });
      serialPortRef.current = port;
      setLocalSerialConnected(true);
      appendSerial(['[PC USB Serial] Connected locally at 115200 baud']);
    } catch (err) {
      appendSerial([`[PC USB Serial] Canceled or unavailable: ${String(err)}`]);
    }
  };

  const handleAcceptP2pOffer = async () => {
    if (!p2pOfferInput.trim()) return;
    try {
      pcRtcRef.current?.close();
      const peer = createLanRtcPeer({
        onStateChange: (s) => setP2pStatus(s),
        onSensorData: ({ gps, imu }) => {
          if (gps) setP2pGps(gps);
          if (imu) setP2pImu(imu);
        },
        onRemoteStream: (stream) => {
          setP2pStreamActive(true);
          if (p2pVideoRef.current) {
            p2pVideoRef.current.srcObject = stream;
            void p2pVideoRef.current.play();
          }
        },
      });
      pcRtcRef.current = peer;
      const offerDesc = JSON.parse(atob(p2pOfferInput.trim())) as RTCSessionDescriptionInit;
      await peer.pc.setRemoteDescription(offerDesc);
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      const answerCode = await peer.gatherCompleteSdp();
      setP2pAnswerCode(answerCode);
      setP2pStatus('answer-ready');
    } catch {
      setP2pStatus('invalid-offer');
    }
  };

  const phoneJoinUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const u = new URL(window.location.href);
    u.searchParams.set('role', 'phone');
    u.searchParams.set('room', roomId);
    return u.toString();
  }, [roomId]);

  const handleCopyPhoneLink = async () => {
    await navigator.clipboard.writeText(phoneJoinUrl);
    setCopiedPhoneLink(true);
    window.setTimeout(() => setCopiedPhoneLink(false), 1800);
  };

  const { snapshot } = relay;
  const { esp32Status } = snapshot;
  const activeGps = p2pGps ?? snapshot.gps;
  const activeImu = p2pImu ?? snapshot.imu;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-2.5">
          {/* Row 1: Branding, Role Switcher, QR + Firmware */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-sky-500/15 border border-sky-500/30 text-sky-400">
                <Bot className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base font-semibold tracking-tight text-slate-100">
                  bro_bot · Wi-Fi POISK_LAN Control Console
                </h1>
                <p className="text-xs text-slate-400">
                  1) Телефон (Камера + GPS) · 2) ПК (Управление) · 3) ESP32 (WiFiServer :8080) ↔ 4)
                  Mega2560 (Serial2, MCU)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-lg border border-slate-700 bg-slate-950 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setRole('pc')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                    role === 'pc'
                      ? 'bg-sky-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Laptop className="w-3.5 h-3.5" />
                  ПК (Управление)
                </button>
                <button
                  type="button"
                  onClick={() => setRole('phone')}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-colors ${
                    role === 'phone'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Smartphone className="w-3.5 h-3.5" />
                  Телефон (Камера/GPS)
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-300"
              >
                <QrCode className="w-3.5 h-3.5" />
                QR для телефона
              </button>

              <button
                type="button"
                onClick={() => setShowSketchModal(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300"
              >
                <Code2 className="w-3.5 h-3.5" />
                Прошивки ESP32 + Mega2560
              </button>
            </div>
          </div>

          {/* Row 2: 4-Device POISK_LAN Connection Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/70">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* ESP32 TCP Host:Port on POISK_LAN */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleToggleEsp32Connect();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1"
              >
                <Wifi
                  className={`w-3.5 h-3.5 ${
                    esp32Status.connected ? 'text-emerald-400' : 'text-slate-400'
                  }`}
                />
                <span className="text-slate-400">ESP32 IP:</span>
                <input
                  type="text"
                  value={espHost}
                  onChange={(e) => setEspHost(e.target.value)}
                  disabled={esp32Status.connected}
                  className="w-28 bg-transparent font-mono text-xs text-slate-100 focus:outline-none"
                  placeholder="192.168.1.50"
                />
                <span className="text-slate-600">:</span>
                <input
                  type="number"
                  value={espPort}
                  onChange={(e) => setEspPort(Number(e.target.value) || 8080)}
                  disabled={esp32Status.connected}
                  className="w-12 bg-transparent font-mono text-xs text-slate-100 focus:outline-none"
                />
                <button
                  type="submit"
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                    esp32Status.connected
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-sky-600 hover:bg-sky-500 text-white'
                  }`}
                >
                  {esp32Status.connected ? 'Откл.' : 'Подкл. TCP'}
                </button>
              </form>

              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${
                  megaTelemetryAlive
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" />
                Mega2560: {megaTelemetryAlive ? 'Serial2 Активен' : 'Ожидание TELEM'}
              </span>

              <span
                className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${
                  snapshot.phoneOnline || p2pStatus === 'connected'
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-900 text-slate-400'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                Телефон:{' '}
                {p2pStatus === 'connected'
                  ? 'P2P Онлайн'
                  : snapshot.phoneOnline
                    ? 'Wi-Fi Онлайн'
                    : 'Ожидание'}
              </span>
            </div>

            {role === 'pc' && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap rounded-lg border border-slate-800 bg-slate-950 p-0.5 gap-0.5">
                  {PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p.id)}
                      title={p.description}
                      className={`px-2 py-1 text-[11px] rounded font-medium transition-colors ${
                        sim.preset === p.id
                          ? 'bg-sky-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleToggleOpticalLed}
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded border ${
                    sim.opticalSensor.ledOn
                      ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  LED
                </button>

                <button
                  type="button"
                  onClick={() => setSim((prev) => ({ ...prev, running: !prev.running }))}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-100"
                >
                  {sim.running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {sim.running ? 'Пауза' : 'Старт'}
                </button>

                <button
                  type="button"
                  onClick={() => setSim(createInitialSimState())}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                  title="Сброс симуляции"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-5 space-y-5">
        {role === 'phone' ? (
          <PhoneSensorView
            roomId={roomId}
            wsConnected={relay.wsConnected}
            pcCount={snapshot.pcCount}
            relayUrl={customRelayUrl}
            onChangeRelayUrl={(url) => {
              setCustomRelayUrl(url);
              if (typeof window !== 'undefined') {
                window.localStorage.setItem('brobot_relay_url', url);
              }
            }}
            onCameraFrame={relay.sendCameraFrame}
            onSensorsUpdate={relay.sendSensors}
          />
        ) : (
          <>
            {esp32Status.lastError && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
                {esp32Status.lastError}
              </div>
            )}

            {/* Live Phone Camera + GPS/IMU */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Camera className="w-4 h-4 text-sky-400" />
                    <h2 className="text-sm font-semibold text-slate-100">
                      Камера смартфона (Wi-Fi POISK_LAN)
                    </h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    {p2pStreamActive
                      ? 'WEBRTC P2P LIVE'
                      : snapshot.cameraActive
                        ? 'WIFI RELAY LIVE'
                        : 'Ожидание видео с телефона'}
                  </span>
                </div>

                <video
                  ref={p2pVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full max-h-72 object-contain rounded-lg border border-slate-800 bg-black ${
                    p2pStreamActive ? 'block' : 'hidden'
                  }`}
                />

                {!p2pStreamActive &&
                  (snapshot.cameraActive && snapshot.latestCameraFrame ? (
                    <img
                      src={snapshot.latestCameraFrame}
                      alt="Live Phone Camera"
                      className="w-full max-h-72 object-contain rounded-lg border border-slate-800 bg-black"
                    />
                  ) : (
                    <div className="h-44 rounded-lg border border-dashed border-slate-800 bg-slate-950/70 flex flex-col items-center justify-center text-center px-4 gap-2">
                      <p className="text-xs text-slate-300 max-w-lg">
                        Откройте этот сайт на смартфоне в сети{' '}
                        <span className="font-mono text-sky-400">POISK_LAN</span> в режиме
                        «Телефон (Камера/GPS)», чтобы видеть картинку с робота.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowQrModal(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600/20 border border-sky-500/40 text-sky-300 text-xs hover:bg-sky-600/30"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        QR-код для телефона
                      </button>
                    </div>
                  ))}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col justify-between space-y-3">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-emerald-400" />
                    <h2 className="text-sm font-semibold text-slate-100">
                      GPS и Акселерометр телефона
                    </h2>
                  </div>

                  <div className="space-y-2 text-xs font-mono">
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                      <div className="text-slate-500 text-[11px]">GPS Координаты</div>
                      <div className="text-slate-100">
                        {activeGps
                          ? `${activeGps.lat.toFixed(6)}, ${activeGps.lng.toFixed(6)}`
                          : 'Нет данных GPS'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {activeGps
                          ? `±${activeGps.accuracyM} м · ${(activeGps.speedMps ?? 0).toFixed(1)} м/с`
                          : 'Включите GPS на телефоне'}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5">
                      <div className="text-slate-500 text-[11px]">Акселерометр / Ориентация</div>
                      <div className="text-emerald-400">
                        {activeImu
                          ? `X:${activeImu.ax} Y:${activeImu.ay} Z:${activeImu.az}`
                          : 'Нет данных IMU'}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {activeImu
                          ? `α:${activeImu.alpha}° β:${activeImu.beta}° γ:${activeImu.gamma}°`
                          : '—'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-950/90 p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-300 font-medium inline-flex items-center gap-1">
                      <Radio className="w-3 h-3 text-indigo-400" />
                      P2P на GitHub Pages ({p2pStatus})
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={p2pOfferInput}
                      onChange={(e) => setP2pOfferInput(e.target.value)}
                      placeholder="Offer-код с телефона..."
                      className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-mono text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAcceptP2pOffer()}
                      className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-[11px] text-white"
                    >
                      Answer
                    </button>
                  </div>
                  {p2pAnswerCode && (
                    <div className="flex gap-1">
                      <input
                        type="text"
                        readOnly
                        value={p2pAnswerCode}
                        className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-mono text-emerald-300"
                      />
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(p2pAnswerCode)}
                        className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-200"
                      >
                        Копир.
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <ArenaViewport
              sim={sim}
              onResetPose={() =>
                setSim((prev) => ({
                  ...prev,
                  pose: { x: 135, y: 130, theta: 0, trail: [{ x: 135, y: 130 }] },
                }))
              }
            />

            <MotorControlPanel
              rightMotor={sim.rightMotor}
              leftMotor={sim.leftMotor}
              onDriveVector={handleDriveVector}
              onSetMotorPosition={handleSetMotorPosition}
              onSetMaxCurrent={handleSetMaxCurrent}
              onResetEncoder={handleResetEncoder}
            />

            <ManipulatorPanel
              joints={sim.armJoints}
              onChangeJoint={(id, targetDeg) => {
                setSim((prev) => ({
                  ...prev,
                  armJoints: prev.armJoints.map((j) => (j.id === id ? { ...j, targetDeg } : j)),
                }));
                sendToRobot(`arm ${id} ${targetDeg}`);
              }}
              onApplyArmPose={(poseName, angles) => {
                setSim((prev) => ({
                  ...prev,
                  armJoints: prev.armJoints.map((j, idx) => ({
                    ...j,
                    targetDeg: angles[idx] ?? j.targetDeg,
                  })),
                }));
                sendToRobot(`armpose ${angles.join(' ')}`);
                appendSerial([`[Dynamixel] Applied arm pose "${poseName}": [${angles.join(', ')}]`]);
              }}
            />

            <ProtocolAndSerialPanel
              packets={packets}
              serialLogs={serialLogs}
              hwVersion={sim.hwVersion}
              onChangeHwVersion={(hwVersion) => setSim((prev) => ({ ...prev, hwVersion }))}
              onSendSerialCommand={handleSendSerialCommand}
              onClearPackets={() => setPackets([])}
              onClearSerial={() => setSerialLogs([])}
              serialConnected={localSerialConnected}
              onToggleWebSerial={handleToggleWebSerial}
              webSerialSupported={webSerialSupported}
            />
          </>
        )}
      </main>

      {/* Phone Pairing QR Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">
                Открыть на телефоне (сеть POISK_LAN)
              </h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-center p-4 rounded-xl bg-white">
              <QRCodeSVG value={phoneJoinUrl} size={196} />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (roomInput.trim()) setRoomId(roomInput.trim());
              }}
              className="flex items-center gap-2 text-xs"
            >
              <span className="text-slate-400">Комната:</span>
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value)}
                className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-200"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded bg-slate-800 border border-slate-700 text-slate-200"
              >
                Ок
              </button>
            </form>

            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={phoneJoinUrl}
                className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-[11px] font-mono text-slate-300"
              />
              <button
                type="button"
                onClick={() => void handleCopyPhoneLink()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white"
              >
                {copiedPhoneLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedPhoneLink ? 'Скопировано' : 'Копировать'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FirmwareSketchModal open={showSketchModal} onClose={() => setShowSketchModal(false)} />
    </div>
  );
}

export default App;
