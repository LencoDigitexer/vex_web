import type { PhoneGpsData, PhoneImuData } from './relayTypes';

export interface CameraStreamerHandle {
  stop: () => void;
}

export async function startPhoneCameraStream(
  videoEl: HTMLVideoElement,
  fps: number,
  onFrame: (dataUrl: string) => void
): Promise<CameraStreamerHandle> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera API (getUserMedia) is unavailable in this browser context.');
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 480 },
      height: { ideal: 360 },
    },
    audio: false,
  });

  videoEl.srcObject = stream;
  await videoEl.play();

  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');

  const intervalMs = Math.max(80, Math.round(1000 / Math.max(1, fps)));
  const timer = window.setInterval(() => {
    if (!ctx || videoEl.readyState < 2) return;
    ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.58);
    onFrame(dataUrl);
  }, intervalMs);

  return {
    stop: () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      videoEl.srcObject = null;
    },
  };
}

export interface SensorsWatchHandle {
  stop: () => void;
}

export function startPhoneSensorsWatch(
  onUpdate: (gps: PhoneGpsData | null, imu: PhoneImuData | null) => void
): SensorsWatchHandle {
  let latestGps: PhoneGpsData | null = null;
  let latestImu: PhoneImuData | null = null;
  let watchId: number | null = null;

  if ('geolocation' in navigator) {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        latestGps = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: Math.round(pos.coords.accuracy),
          speedMps: pos.coords.speed,
          headingDeg: pos.coords.heading,
          timestamp: Date.now(),
        };
      },
      () => {
        // Ignore GPS errors when permission denied or indoors
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 8000 }
    );
  }

  let ax = 0;
  let ay = 0;
  let az = 0;
  let alpha = 0;
  let beta = 0;
  let gamma = 0;

  const onMotion = (e: DeviceMotionEvent) => {
    const acc = e.accelerationIncludingGravity || e.acceleration;
    if (acc) {
      ax = Number((acc.x ?? 0).toFixed(2));
      ay = Number((acc.y ?? 0).toFixed(2));
      az = Number((acc.z ?? 0).toFixed(2));
      latestImu = { ax, ay, az, alpha, beta, gamma, timestamp: Date.now() };
    }
  };

  const onOrient = (e: DeviceOrientationEvent) => {
    alpha = Number((e.alpha ?? 0).toFixed(1));
    beta = Number((e.beta ?? 0).toFixed(1));
    gamma = Number((e.gamma ?? 0).toFixed(1));
    latestImu = { ax, ay, az, alpha, beta, gamma, timestamp: Date.now() };
  };

  window.addEventListener('devicemotion', onMotion);
  window.addEventListener('deviceorientation', onOrient);

  const emitTimer = window.setInterval(() => {
    if (latestGps || latestImu) {
      onUpdate(latestGps, latestImu);
    }
  }, 250);

  return {
    stop: () => {
      window.clearInterval(emitTimer);
      if (watchId !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchId);
      }
      window.removeEventListener('devicemotion', onMotion);
      window.removeEventListener('deviceorientation', onOrient);
    },
  };
}
