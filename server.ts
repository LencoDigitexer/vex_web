import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ClientRole,
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

function getLanAddresses(port: number): string[] {
  const nets = os.networkInterfaces();
  const urls: string[] = [];
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
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
