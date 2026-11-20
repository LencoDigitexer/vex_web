import { useCallback, useEffect, useRef, useState } from 'react';
import type { Esp32Status } from './relayTypes';

interface UseEsp32SocketOptions {
  onLine: (line: string) => void;
  onStatusLog: (line: string) => void;
}

export function useEsp32Socket({ onLine, onStatusLog }: UseEsp32SocketOptions) {
  const [espUrl, setEspUrl] = useState<string>(() => {
    if (typeof window === 'undefined') return 'ws://brobot.local:81';
    return window.localStorage.getItem('brobot_esp32_url') || 'ws://brobot.local:81';
  });

  const [status, setStatus] = useState<Esp32Status>({
    connected: false,
    url: espUrl,
    wifiSsid: 'POISK_LAN',
    lastError: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const rxBufRef = useRef('');
  const onLineRef = useRef(onLine);
  const onStatusLogRef = useRef(onStatusLog);
  onLineRef.current = onLine;
  onStatusLogRef.current = onStatusLog;

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus((prev) => ({
      ...prev,
      connected: false,
      lastError: null,
    }));
  }, []);

  const connect = useCallback(
    (targetUrl?: string) => {
      const url = (targetUrl ?? espUrl).trim();
      if (!url) return;
      setEspUrl(url);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('brobot_esp32_url', url);
      }

      wsRef.current?.close();

      let sock: WebSocket;
      try {
        sock = new WebSocket(url);
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : 'WebSocket blocked (if on HTTPS GitHub Pages, allow insecure ws:// or run local HTTP/WS server on POISK_LAN)';
        setStatus({ connected: false, url, wifiSsid: 'POISK_LAN', lastError: msg });
        onStatusLogRef.current(`[ESP32 ❌] ${msg}`);
        return;
      }

      wsRef.current = sock;
      onStatusLogRef.current(`[ESP32] Подключение к ${url} (Wi-Fi POISK_LAN)...`);

      sock.onopen = () => {
        setStatus({ connected: true, url, wifiSsid: 'POISK_LAN', lastError: null });
        onStatusLogRef.current(`[ESP32 ✓] Подключен к ${url} -> Mega2560 Serial2 (115200)`);
      };

      sock.onmessage = (event) => {
        const chunk = String(event.data);
        rxBufRef.current += chunk;
        // Handle both newline-delimited and single-message frames
        if (rxBufRef.current.includes('\n')) {
          const parts = rxBufRef.current.split(/\r?\n/);
          rxBufRef.current = parts.pop() ?? '';
          for (const p of parts) {
            const line = p.trim();
            if (line) onLineRef.current(line);
          }
        } else {
          const line = rxBufRef.current.trim();
          rxBufRef.current = '';
          if (line) onLineRef.current(line);
        }
      };

      sock.onerror = () => {
        const isHttpsPage =
          typeof window !== 'undefined' && window.location.protocol === 'https:';
        const hint =
          isHttpsPage && url.startsWith('ws://')
            ? 'Браузер на HTTPS (GitHub Pages) блокирует ws:// к локальному IP. Разрешите "Insecure content" для сайта или откройте локальный сервер на Ubuntu (npm run dev).'
            : `Не удалось подключиться к ${url}. Проверьте Wi-Fi POISK_LAN и IP ESP32.`;
        setStatus({ connected: false, url, wifiSsid: 'POISK_LAN', lastError: hint });
        onStatusLogRef.current(`[ESP32 ❌] ${hint}`);
      };

      sock.onclose = () => {
        setStatus((prev) => ({ ...prev, connected: false }));
      };
    },
    [espUrl]
  );

  const sendCommandLine = useCallback((line: string): boolean => {
    const sock = wsRef.current;
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      return false;
    }
    const payload = line.endsWith('\n') ? line : `${line}\n`;
    sock.send(payload);
    return true;
  }, []);

  return {
    espUrl,
    setEspUrl,
    status,
    connect,
    disconnect,
    sendCommandLine,
  };
}
