import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Check,
  Compass,
  Copy,
  Laptop,
  Radio,
  Smartphone,
  VideoOff,
  Wifi,
} from 'lucide-react';
import {
  CameraStreamerHandle,
  SensorsWatchHandle,
  startPhoneCameraStream,
  startPhoneSensorsWatch,
} from '../lib/phoneSensors';
import type { PhoneGpsData, PhoneImuData } from '../lib/relayTypes';
import { createLanRtcPeer } from '../lib/webrtcPeer';

interface PhoneSensorViewProps {
  roomId: string;
  wsConnected: boolean;
  pcCount: number;
  relayUrl: string;
  onChangeRelayUrl: (url: string) => void;
  onCameraFrame: (dataUrl: string, active: boolean) => void;
  onSensorsUpdate: (gps: PhoneGpsData | null, imu: PhoneImuData | null) => void;
}

export const PhoneSensorView: React.FC<PhoneSensorViewProps> = ({
  roomId,
  wsConnected,
  pcCount,
  relayUrl,
  onChangeRelayUrl,
  onCameraFrame,
  onSensorsUpdate,
}) => {
  const [relayInput, setRelayInput] = useState(relayUrl);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraFps, setCameraFps] = useState(6);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraHandleRef = useRef<CameraStreamerHandle | null>(null);

  const [sensorsActive, setSensorsActive] = useState(false);
  const [gps, setGps] = useState<PhoneGpsData | null>(null);
  const [imu, setImu] = useState<PhoneImuData | null>(null);
  const sensorsHandleRef = useRef<SensorsWatchHandle | null>(null);

  // Optional Serverless WebRTC P2P (for pure static GitHub Pages without Node relay)
  const [p2pState, setP2pState] = useState<string>('idle');
  const [p2pOfferCode, setP2pOfferCode] = useState('');
  const [p2pAnswerInput, setP2pAnswerInput] = useState('');
  const [copiedOffer, setCopiedOffer] = useState(false);
  const rtcRef = useRef<ReturnType<typeof createLanRtcPeer> | null>(null);

  useEffect(() => {
    return () => {
      cameraHandleRef.current?.stop();
      sensorsHandleRef.current?.stop();
      rtcRef.current?.close();
    };
  }, []);

  const handleToggleCamera = async () => {
    setCameraError(null);
    if (cameraActive) {
      cameraHandleRef.current?.stop();
      cameraHandleRef.current = null;
      setCameraActive(false);
      onCameraFrame('', false);
      return;
    }

    if (!videoRef.current) return;
    try {
      const handle = await startPhoneCameraStream(videoRef.current, cameraFps, (dataUrl) => {
        onCameraFrame(dataUrl, true);
      });
      cameraHandleRef.current = handle;
      setCameraActive(true);
    } catch (err) {
      setCameraError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleSensors = () => {
    if (sensorsActive) {
      sensorsHandleRef.current?.stop();
      sensorsHandleRef.current = null;
      setSensorsActive(false);
      return;
    }

    const handle = startPhoneSensorsWatch((nextGps, nextImu) => {
      setGps(nextGps);
      setImu(nextImu);
      onSensorsUpdate(nextGps, nextImu);
      rtcRef.current?.sendSensorData({ gps: nextGps, imu: nextImu });
    });
    sensorsHandleRef.current = handle;
    setSensorsActive(true);
  };

  // Serverless WebRTC Offer creation on Phone
  const handleCreateP2pOffer = async () => {
    rtcRef.current?.close();
    const peer = createLanRtcPeer({
      onStateChange: (s) => setP2pState(s),
    });
    rtcRef.current = peer;
    peer.initDataChannel('sensors');

    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (stream) {
      stream.getTracks().forEach((t) => peer.pc.addTrack(t, stream));
    }

    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    const code = await peer.gatherCompleteSdp();
    setP2pOfferCode(code);
    setP2pState('offer-ready');
  };

  const handleApplyP2pAnswer = async () => {
    if (!rtcRef.current || !p2pAnswerInput.trim()) return;
    try {
      const desc = JSON.parse(atob(p2pAnswerInput.trim())) as RTCSessionDescriptionInit;
      await rtcRef.current.pc.setRemoteDescription(desc);
      setP2pState('connecting');
    } catch {
      setP2pState('invalid-answer');
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              Смартфон на роботе: Камера и GPS (Wi-Fi POISK_LAN)
            </h2>
            <p className="text-xs text-slate-400">
              Комната: <span className="font-mono text-sky-400">{roomId}</span> · Релей:{' '}
              <span className={wsConnected ? 'text-emerald-400' : 'text-amber-400'}>
                {wsConnected ? 'Подключен' : 'Локальный режим / ожидание'}
              </span>
            </p>
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border ${
            pcCount > 0 || p2pState === 'connected'
              ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
              : 'border-slate-700 bg-slate-800 text-slate-400'
          }`}
        >
          <Laptop className="w-3.5 h-3.5" />
          {pcCount > 0 || p2pState === 'connected' ? 'ПК подключен' : 'Ожидание ПК'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Camera + GPS Controls */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">
                1. Камера, GPS и Акселерометр → ПК
              </h3>
              <p className="text-xs text-slate-400">
                Передача видео и координат с телефона на компьютер по Wi-Fi POISK_LAN
              </p>
            </div>
            <select
              value={cameraFps}
              onChange={(e) => setCameraFps(Number(e.target.value))}
              disabled={cameraActive}
              className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-mono text-slate-200"
            >
              <option value={4}>4 FPS</option>
              <option value={6}>6 FPS</option>
              <option value={10}>10 FPS</option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleToggleCamera()}
              className={`inline-flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-xs font-medium border ${
                cameraActive
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                  : 'border-sky-500/50 bg-sky-600 hover:bg-sky-500 text-white'
              }`}
            >
              {cameraActive ? <VideoOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
              {cameraActive ? 'Остановить камеру' : 'Включить камеру → ПК'}
            </button>

            <button
              type="button"
              onClick={handleToggleSensors}
              className={`inline-flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-xs font-medium border ${
                sensorsActive
                  ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                  : 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
              }`}
            >
              <Compass className="w-4 h-4" />
              {sensorsActive ? 'Остановить GPS/IMU' : 'Включить GPS + IMU → ПК'}
            </button>
          </div>

          {cameraError && <div className="text-xs text-rose-400">{cameraError}</div>}

          <div className="grid grid-cols-2 gap-3 items-start">
            <div className="rounded-lg border border-slate-800 bg-slate-950 overflow-hidden aspect-[4/3] flex items-center justify-center">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />
              {!cameraActive && (
                <span className="text-[11px] text-slate-500 px-2 text-center">
                  Превью камеры телефона
                </span>
              )}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-[11px] font-mono space-y-1.5 text-slate-300">
              <div>
                <span className="text-slate-500">GPS:</span>{' '}
                {gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${gps.accuracyM}m)` : '—'}
              </div>
              <div>
                <span className="text-slate-500">ACC:</span>{' '}
                {imu ? `${imu.ax}, ${imu.ay}, ${imu.az}` : '—'}
              </div>
              <div>
                <span className="text-slate-500">ORI:</span>{' '}
                {imu ? `${imu.alpha}° / ${imu.beta}° / ${imu.gamma}°` : '—'}
              </div>
            </div>
          </div>
        </div>

        {/* Network / Relay / GitHub Pages P2P Connection */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-sky-400" />
              2. Связь с компьютером в сети POISK_LAN
            </h3>
            <p className="text-xs text-slate-400">
              При работе через локальный сервер укажите ws://IP_НОУТБУКА:3000/ws. На GitHub Pages без
              сервера используйте прямой WebRTC P2P.
            </p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onChangeRelayUrl(relayInput.trim());
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={relayInput}
              onChange={(e) => setRelayInput(e.target.value)}
              placeholder="ws://192.168.1.10:3000/ws"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-100"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-xs text-slate-200"
            >
              Подключить
            </button>
          </form>

          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200 inline-flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-indigo-400" />
                Прямой WebRTC P2P (GitHub Pages без сервера)
              </span>
              <span className="font-mono text-[11px] text-slate-400">{p2pState}</span>
            </div>

            <button
              type="button"
              onClick={() => void handleCreateP2pOffer()}
              className="w-full py-2 rounded-lg bg-indigo-600/25 border border-indigo-500/40 hover:bg-indigo-600/35 text-xs font-medium text-indigo-200"
            >
              Создать P2P Offer (после включения камеры)
            </button>

            {p2pOfferCode && (
              <div className="space-y-2">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={p2pOfferCode}
                    className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-mono text-slate-300"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(p2pOfferCode);
                      setCopiedOffer(true);
                      window.setTimeout(() => setCopiedOffer(false), 1500);
                    }}
                    className="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-xs text-slate-200 inline-flex items-center gap-1"
                  >
                    {copiedOffer ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>

                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={p2pAnswerInput}
                    onChange={(e) => setP2pAnswerInput(e.target.value)}
                    placeholder="Вставьте Answer-код с ПК..."
                    className="flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] font-mono text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => void handleApplyP2pAnswer()}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs text-white"
                  >
                    Соединить
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
