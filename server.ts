import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ClientRole,
  Esp32Status,
  PhoneGpsData,
  PhoneImuData,
  RelayClientMessage,
  RelayServerMessage,
  RoomSnapshot,
} from './src/lib/relayTypes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ClientMeta {
  socket: WebSocket;
  roomId: string | null;
  role: ClientRole | null;
  deviceLabel: string;
}

interface RoomState {
  roomId: string;
  clients: Set<ClientMeta>;
  cameraActive: boolean;
  latestCameraFrame: string | null;
  gps: PhoneGpsData | null;
  imu: PhoneImuData | null;
  esp32Socket: net.Socket | null;
  esp32RxBuffer: string;
  esp32Status: Esp32Status;
}

const rooms = new Map<string, RoomState>();

function getOrCreateRoom(roomId: string): RoomState {
  const cleanId = roomId.trim() || 'bro_bot_1';
  let room = rooms.get(cleanId);
  if (!room) {
    room = {
      roomId: cleanId,
      clients: new Set(),
      cameraActive: false,
      latestCameraFrame: null,
      gps: null,
      imu: null,
      esp32Socket: null,
      esp32RxBuffer: '',
      esp32Status: {
        connected: false,
        host: 'brobot.local',
        port: 8080,
        wifiSsid: 'POISK_LAN',
        lastError: null,
      },
    };
    rooms.set(cleanId, room);
  }
  return room;
}

function getPresence(room: RoomState) {
  let phoneOnline = false;
  let pcCount = 0;
  let phoneDeviceLabel: string | null = null;
  for (const c of room.clients) {
    if (c.socket.readyState === WebSocket.OPEN) {
      if (c.role === 'phone') {
        phoneOnline = true;
        phoneDeviceLabel = c.deviceLabel;
      } else if (c.role === 'pc') {
        pcCount += 1;
      }
    }
  }
  return { phoneOnline, pcCount, phoneDeviceLabel };
}

function buildSnapshot(room: RoomState): RoomSnapshot {
  const { phoneOnline, pcCount, phoneDeviceLabel } = getPresence(room);
  return {
    roomId: room.roomId,
    phoneOnline,
    pcCount,
    phoneDeviceLabel,
    cameraActive: room.cameraActive,
    latestCameraFrame: room.latestCameraFrame,
    gps: room.gps,
    imu: room.imu,
    esp32Status: room.esp32Status,
    serverTime: Date.now(),
  };
}

function sendJson(socket: WebSocket, msg: RelayServerMessage) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function broadcastRoom(
  room: RoomState,
  msg: RelayServerMessage,
  targetRole?: ClientRole,
  excludeSocket?: WebSocket
) {
  const encoded = JSON.stringify(msg);
  for (const client of room.clients) {
    if (excludeSocket && client.socket === excludeSocket) continue;
    if (targetRole && client.role !== targetRole) continue;
    if (client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(encoded);
    }
  }
}

function broadcastPresence(room: RoomState) {
  const { phoneOnline, pcCount, phoneDeviceLabel } = getPresence(room);
  broadcastRoom(room, {
    type: 'room:presence',
    roomId: room.roomId,
    phoneOnline,
    pcCount,
    phoneDeviceLabel,
  });
}

function disconnectEsp32Tcp(room: RoomState, reason: string | null = null) {
  if (room.esp32Socket) {
    room.esp32Socket.removeAllListeners();
    room.esp32Socket.destroy();
    room.esp32Socket = null;
  }
  room.esp32RxBuffer = '';
  room.esp32Status = {
    ...room.esp32Status,
    connected: false,
    lastError: reason,
  };
  broadcastRoom(room, { type: 'esp32:status', status: room.esp32Status });
}

function connectEsp32Tcp(room: RoomState, host: string, port: number) {
  disconnectEsp32Tcp(room, null);

  const cleanHost = host.trim() || 'brobot.local';
  const cleanPort = Number.isFinite(port) && port > 0 ? Math.round(port) : 8080;

  room.esp32Status = {
    connected: false,
    host: cleanHost,
    port: cleanPort,
    wifiSsid: 'POISK_LAN',
    lastError: null,
  };

  const tcp = new net.Socket();
  tcp.setNoDelay(true);
  tcp.setTimeout(5000);
  room.esp32Socket = tcp;

  tcp.connect(cleanPort, cleanHost, () => {
    tcp.setTimeout(0);
    room.esp32Status = {
      connected: true,
      host: cleanHost,
      port: cleanPort,
      wifiSsid: 'POISK_LAN',
      lastError: null,
    };
    broadcastRoom(room, { type: 'esp32:status', status: room.esp32Status });
    broadcastRoom(room, {
      type: 'esp32:rx',
      lines: [`[ESP32 TCP ✓] Подключено к ${cleanHost}:${cleanPort} (POISK_LAN)`],
    });
  });

  tcp.on('data', (chunk) => {
    room.esp32RxBuffer += chunk.toString('utf8');
    const parts = room.esp32RxBuffer.split(/\r?\n/);
    room.esp32RxBuffer = parts.pop() ?? '';
    const lines = parts.map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length > 0) {
      broadcastRoom(room, { type: 'esp32:rx', lines }, 'pc');
    }
  });

  tcp.on('timeout', () => {
    disconnectEsp32Tcp(
      room,
      `Таймаут подключения к ${cleanHost}:${cleanPort}. Проверьте IP ESP32 и Wi-Fi POISK_LAN.`
    );
  });

  tcp.on('error', (err) => {
    disconnectEsp32Tcp(room, `Ошибка TCP (${cleanHost}:${cleanPort}): ${err.message}`);
  });

  tcp.on('close', () => {
    if (room.esp32Socket === tcp) {
      disconnectEsp32Tcp(room, null);
    }
  });
}

function getLanAddresses(port: number): string[] {
  const nets = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const netIf of entries) {
      if (netIf.family === 'IPv4' && !netIf.internal) {
        urls.push(`http://${netIf.address}:${port}`);
      }
    }
  }
  return urls;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    const activeRooms = Array.from(rooms.values()).map((r) => {
      const presence = getPresence(r);
      return {
        roomId: r.roomId,
        phoneOnline: presence.phoneOnline,
        pcCount: presence.pcCount,
        cameraActive: r.cameraActive,
        esp32Connected: r.esp32Status.connected,
      };
    });
    res.json({ ok: true, activeRooms, serverTime: Date.now() });
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (socket) => {
    const meta: ClientMeta = {
      socket,
      roomId: null,
      role: null,
      deviceLabel: 'Unknown device',
    };

    socket.on('message', (raw) => {
      let msg: RelayClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as RelayClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'ping') {
        sendJson(socket, { type: 'pong', ts: msg.ts, serverTime: Date.now() });
        return;
      }

      if (msg.type === 'room:join') {
        if (meta.roomId) {
          const prevRoom = rooms.get(meta.roomId);
          if (prevRoom) {
            prevRoom.clients.delete(meta);
            broadcastPresence(prevRoom);
          }
        }

        const room = getOrCreateRoom(msg.roomId);
        meta.roomId = room.roomId;
        meta.role = msg.role;
        meta.deviceLabel =
          msg.deviceLabel || (msg.role === 'phone' ? 'Android Camera/GPS' : 'Ubuntu PC');
        room.clients.add(meta);

        sendJson(socket, { type: 'room:sync', snapshot: buildSnapshot(room) });
        broadcastPresence(room);
        return;
      }

      const roomId = msg.roomId || meta.roomId;
      if (!roomId) return;
      const room = getOrCreateRoom(roomId);

      if (msg.type === 'esp32:connect') {
        connectEsp32Tcp(room, msg.host, msg.port);
        return;
      }

      if (msg.type === 'esp32:disconnect') {
        disconnectEsp32Tcp(room, null);
        return;
      }

      if (msg.type === 'esp32:send') {
        if (room.esp32Socket && !room.esp32Socket.destroyed) {
          const payload = msg.line.endsWith('\n') ? msg.line : `${msg.line}\n`;
          room.esp32Socket.write(payload);
        }
        return;
      }

      if (msg.type === 'phone:camera_frame') {
        room.cameraActive = msg.cameraActive;
        room.latestCameraFrame = msg.cameraActive ? msg.dataUrl : null;
        broadcastRoom(
          room,
          {
            type: 'phone:camera_frame',
            dataUrl: msg.dataUrl,
            cameraActive: msg.cameraActive,
          },
          'pc',
          socket
        );
        return;
      }

      if (msg.type === 'phone:sensors') {
        room.gps = msg.gps;
        room.imu = msg.imu;
        broadcastRoom(room, { type: 'phone:sensors', gps: msg.gps, imu: msg.imu }, 'pc', socket);
        return;
      }

      if (msg.type === 'rtc:signal') {
        const targetRole: ClientRole = msg.fromRole === 'phone' ? 'pc' : 'phone';
        broadcastRoom(
          room,
          { type: 'rtc:signal', fromRole: msg.fromRole, signal: msg.signal },
          targetRole,
          socket
        );
      }
    });

    socket.on('close', () => {
      if (!meta.roomId) return;
      const room = rooms.get(meta.roomId);
      if (!room) return;
      const wasPhone = meta.role === 'phone';
      room.clients.delete(meta);

      const presence = getPresence(room);
      if (wasPhone && !presence.phoneOnline) {
        room.cameraActive = false;
        room.latestCameraFrame = null;
        broadcastRoom(room, {
          type: 'phone:camera_frame',
          dataUrl: '',
          cameraActive: false,
        });
      }
      broadcastPresence(room);
    });
  });

  if (process.env.NODE_ENV === 'production') {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[vex_web] POISK_LAN Relay & Web server listening on http://0.0.0.0:${PORT}`);
    for (const lanUrl of getLanAddresses(PORT)) {
      console.log(`[vex_web] Local Wi-Fi URL: ${lanUrl}`);
    }
  });
}

startServer().catch((err) => {
  console.error('[vex_web] Failed to start server:', err);
  process.exit(1);
});
