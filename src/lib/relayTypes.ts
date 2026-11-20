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
  url: string;
  wifiSsid: string;
  lastError: string | null;
}

export interface RobotCommandPayload {
  commandId: string;
  kind:
    | 'drive'
    | 'set_position'
    | 'set_max_current'
    | 'reset_encoder'
    | 'arm_joint'
    | 'arm_pose'
    | 'optical_led'
    | 'raw_serial';
  serialText: string;
  leftSpeed?: number;
  rightSpeed?: number;
  side?: 'left' | 'right';
  angleDeg?: number;
  maxSpeed?: number;
  maxCurrentMa?: number;
  jointId?: number;
  angles?: number[];
  ledOn?: boolean;
  timestamp: number;
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
      type: 'rtc:signal';
      fromRole: ClientRole;
      signal: unknown;
    }
  | {
      type: 'pong';
      ts: number;
      serverTime: number;
    };
