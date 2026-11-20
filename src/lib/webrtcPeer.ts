// Peer-to-Peer WebRTC helper for streaming Phone Camera + GPS/IMU directly to PC over local Wi-Fi (POISK_LAN)
// Works both automatically via WebSocket signaling AND manually via serverless SDP exchange on GitHub Pages.

import type { PhoneGpsData, PhoneImuData } from './relayTypes';

export interface RtcSensorPacket {
  gps: PhoneGpsData | null;
  imu: PhoneImuData | null;
}

export function createLanRtcPeer(options: {
  onSensorData?: (data: RtcSensorPacket) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onStateChange?: (state: RTCPeerConnectionState) => void;
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void;
}) {
  // Empty iceServers works directly on local LAN (POISK_LAN) with zero external dependencies
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  });

  let dataChannel: RTCDataChannel | null = null;

  const wireDataChannel = (dc: RTCDataChannel) => {
    dataChannel = dc;
    dc.onmessage = (event) => {
      try {
        const parsed = JSON.parse(String(event.data)) as RtcSensorPacket;
        options.onSensorData?.(parsed);
      } catch {
        // ignore malformed packet
      }
    };
  };

  pc.ondatachannel = (event) => {
    wireDataChannel(event.channel);
  };

  pc.ontrack = (event) => {
    const stream = event.streams[0];
    if (stream) {
      options.onRemoteStream?.(stream);
    }
  };

  pc.onconnectionstatechange = () => {
    options.onStateChange?.(pc.connectionState);
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      options.onIceCandidate?.(event.candidate.toJSON());
    }
  };

  return {
    pc,
    initDataChannel: (label = 'sensors') => {
      const dc = pc.createDataChannel(label);
      wireDataChannel(dc);
      return dc;
    },
    sendSensorData: (data: RtcSensorPacket) => {
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify(data));
        return true;
      }
      return false;
    },
    gatherCompleteSdp: async (): Promise<string> => {
      if (pc.iceGatheringState !== 'complete') {
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 1500);
          const check = () => {
            if (pc.iceGatheringState === 'complete') {
              window.clearTimeout(timeout);
              pc.removeEventListener('icegatheringstatechange', check);
              resolve();
            }
          };
          pc.addEventListener('icegatheringstatechange', check);
        });
      }
      return btoa(JSON.stringify(pc.localDescription));
    },
    close: () => {
      dataChannel?.close();
      pc.close();
    },
  };
}
