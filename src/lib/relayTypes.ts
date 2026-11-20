export type ClientRole = 'pc' | 'phone';

export interface PhoneGpsData {
  lat: number;
  lng: number;
  accuracyM: number;
  speedMps: number | null;
  headingDeg: number | null;
  timestamp: number;
}

export interface PhoneImuData {
  ax: number;
  ay: number;
  az: number;
  alpha: number;
  beta: number;
  gamma: number;
  timestamp: number;
}

export interface Esp32Status {
  connected: boolean;
  host: string;
  port: number;
  wifiSsid: string;
  lastError: string | null;
}

export interface RoomSnapshot {
  roomId: string;
  phoneOnline: boolean;
  pcCount: number;
  phoneDeviceLabel: string | null;
  cameraActive: boolean;
  latestCameraFrame: string | null;
  gps: PhoneGpsData | null;
  imu: PhoneImuData | null;
  esp32Status: Esp32Status;
  serverTime: number;
}

export type RelayClientMessage =
  | {
      type: 'room:join';
      roomId: string;
      role: ClientRole;
      deviceLabel: string;
    }
  | {
      type: 'phone:camera_frame';
      roomId: string;
      dataUrl: string;
      cameraActive: boolean;
    }
  | {
      type: 'phone:sensors';
      roomId: string;
      gps: PhoneGpsData | null;
      imu: PhoneImuData | null;
    }
  | {
      type: 'esp32:connect';
      roomId: string;
      host: string;
      port: number;
    }
  | {
      type: 'esp32:disconnect';
      roomId: string;
    }
  | {
      type: 'esp32:send';
      roomId: string;
      line: string;
    }
  | {
      type: 'rtc:signal';
      roomId: string;
      fromRole: ClientRole;
      signal: unknown;
    }
  | {
      type: 'ping';
      ts: number;
    };

export type RelayServerMessage =
  | {
      type: 'room:sync';
      snapshot: RoomSnapshot;
    }
  | {
      type: 'room:presence';
      roomId: string;
      phoneOnline: boolean;
      pcCount: number;
      phoneDeviceLabel: string | null;
    }
  | {
      type: 'phone:camera_frame';
      dataUrl: string;
      cameraActive: boolean;
    }
  | {
      type: 'phone:sensors';
      gps: PhoneGpsData | null;
      imu: PhoneImuData | null;
    }
  | {
      type: 'esp32:status';
      status: Esp32Status;
    }
  | {
      type: 'esp32:rx';
      lines: string[];
    }
  | {
      type: 'rtc:signal';
      fromRole: ClientRole;
      signal: unknown;
    }
  | {
      type: 'pong';
      ts: number;
      serverTime: number;
    };
