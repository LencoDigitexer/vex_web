import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientRole,
  PhoneGpsData,
  PhoneImuData,
  RelayClientMessage,
  RelayServerMessage,
  RoomSnapshot,
} from './relayTypes';

interface UseRelaySocketOptions {
  roomId: string;
  role: ClientRole;
  deviceLabel: string;
  customRelayUrl?: string;
  onRtcSignal?: (fromRole: ClientRole, signal: unknown) => void;
}

const DEFAULT_SNAPSHOT = (roomId: string): RoomSnapshot => ({
  roomId,
  phoneOnline: false,
  pcCount: 0,
  phoneDeviceLabel: null,
  cameraActive: false,
  latestCameraFrame: null,
  gps: null,
  imu: null,
  serverTime: Date.now(),
});

export function getDefaultRelayUrl(): string {
  if (typeof window === 'undefined') return '';
  if (window.location.hostname.endsWith('github.io')) {
    return window.localStorage.getItem('brobot_relay_url') || '';
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export function useRelaySocket({
  roomId,
  role,
  deviceLabel,
  customRelayUrl,
  onRtcSignal,
}: UseRelaySocketOptions) {
  const [wsConnected, setWsConnected] = useState(false);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [snapshot, setSnapshot] = useState<RoomSnapshot>(() => DEFAULT_SNAPSHOT(roomId));

  const wsRef = useRef<WebSocket | null>(null);
  const onRtcSignalRef = useRef(onRtcSignal);
  onRtcSignalRef.current = onRtcSignal;

  const activeUrl = customRelayUrl !== undefined ? customRelayUrl.trim() : getDefaultRelayUrl();

  const sendRaw = useCallback((msg: RelayClientMessage) => {
    const sock = wsRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!activeUrl) {
      setWsConnected(false);
      setRttMs(null);
      return;
    }

    let disposed = false;
    let reconnectTimer: number | null = null;
    let pingTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (disposed) return;
      let sock: WebSocket;
      try {
        sock = new WebSocket(activeUrl);
      } catch {
        setWsConnected(false);
        return;
      }
      wsRef.current = sock;

      sock.onopen = () => {
        if (disposed) {
          sock.close();
          return;
        }
        attempt = 0;
        setWsConnected(true);
        sock.send(
          JSON.stringify({
            type: 'room:join',
            roomId,
            role,
            deviceLabel,
          } satisfies RelayClientMessage)
        );
        sock.send(JSON.stringify({ type: 'ping', ts: Date.now() } satisfies RelayClientMessage));
      };

      sock.onmessage = (event) => {
        let msg: RelayServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as RelayServerMessage;
        } catch {
          return;
        }

        if (msg.type === 'pong') {
          setRttMs(Math.max(1, Date.now() - msg.ts));
          return;
        }

        if (msg.type === 'room:sync') {
          setSnapshot(msg.snapshot);
          return;
        }

        if (msg.type === 'room:presence') {
          setSnapshot((prev) => ({
            ...prev,
            roomId: msg.roomId,
            phoneOnline: msg.phoneOnline,
            pcCount: msg.pcCount,
            phoneDeviceLabel: msg.phoneDeviceLabel,
          }));
          return;
        }

        if (msg.type === 'phone:camera_frame') {
          setSnapshot((prev) => ({
            ...prev,
            cameraActive: msg.cameraActive,
            latestCameraFrame: msg.cameraActive ? msg.dataUrl : null,
          }));
          return;
        }

        if (msg.type === 'phone:sensors') {
          setSnapshot((prev) => ({ ...prev, gps: msg.gps, imu: msg.imu }));
          return;
        }

        if (msg.type === 'rtc:signal') {
          onRtcSignalRef.current?.(msg.fromRole, msg.signal);
        }
      };

      sock.onclose = () => {
        setWsConnected(false);
        setRttMs(null);
        if (disposed) return;
        const delay = Math.min(6000, 800 * Math.pow(1.5, attempt));
        attempt += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };

      sock.onerror = () => {
        sock.close();
      };
    };

    connect();
    pingTimer = window.setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      }
    }, 3000);

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (pingTimer !== null) window.clearInterval(pingTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [activeUrl, roomId, role, deviceLabel]);

  const sendCameraFrame = useCallback(
    (dataUrl: string, cameraActive: boolean) =>
      sendRaw({ type: 'phone:camera_frame', roomId, dataUrl, cameraActive }),
    [roomId, sendRaw]
  );

  const sendSensors = useCallback(
    (gps: PhoneGpsData | null, imu: PhoneImuData | null) =>
      sendRaw({ type: 'phone:sensors', roomId, gps, imu }),
    [roomId, sendRaw]
  );

  const sendRtcSignal = useCallback(
    (signal: unknown) =>
      sendRaw({ type: 'rtc:signal', roomId, fromRole: role, signal }),
    [role, roomId, sendRaw]
  );

  return {
    activeUrl,
    wsConnected,
    rttMs,
    snapshot,
    sendCameraFrame,
    sendSensors,
    sendRtcSignal,
  };
}
