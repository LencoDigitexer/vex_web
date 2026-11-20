import React, { useEffect, useRef } from 'react';
import { ARENA_HEIGHT_CM, ARENA_WIDTH_CM, RobotSimState } from '../lib/robotSim';

interface ArenaViewportProps {
  sim: RobotSimState;
  onResetPose: () => void;
}

export const ArenaViewport: React.FC<ArenaViewportProps> = ({ sim, onResetPose }) => {
  const arenaCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const armCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = arenaCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = canvas.width / ARENA_WIDTH_CM;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background grid
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= ARENA_WIDTH_CM; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= ARENA_HEIGHT_CM; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(canvas.width, y * scale);
      ctx.stroke();
    }

    // Color zones for Vex5_Optical
    for (const zone of sim.colorZones) {
      const grad = ctx.createRadialGradient(
        zone.x * scale,
        zone.y * scale,
        2,
        zone.x * scale,
        zone.y * scale,
        zone.radius * scale
      );
      const r = Math.min(255, Math.round(zone.r / 4));
      const g = Math.min(255, Math.round(zone.g / 4));
      const b = Math.min(255, Math.round(zone.b / 4));
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.55)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0.05)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(zone.x * scale, zone.y * scale, zone.radius * scale, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.65)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = 'rgba(226, 232, 240, 0.7)';
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(zone.name, (zone.x - 16) * scale, (zone.y - zone.radius - 4) * scale);
    }

    // Obstacles
    for (const obs of sim.obstacles) {
      ctx.fillStyle = 'rgba(30, 41, 59, 0.95)';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.5;
      ctx.fillRect(obs.x * scale, obs.y * scale, obs.w * scale, obs.h * scale);
      ctx.strokeRect(obs.x * scale, obs.y * scale, obs.w * scale, obs.h * scale);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
      ctx.fillText(obs.label, (obs.x + 3) * scale, (obs.y + 12) * scale);
    }

    // Robot trail
    if (sim.pose.trail.length > 1) {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      sim.pose.trail.forEach((pt, idx) => {
        if (idx === 0) ctx.moveTo(pt.x * scale, pt.y * scale);
        else ctx.lineTo(pt.x * scale, pt.y * scale);
      });
      ctx.stroke();
    }

    // Distance sensor ray
    const rayLenCm = 14 + sim.distanceSensor.distanceMm / 10;
    const rx = sim.pose.x + Math.cos(sim.pose.theta) * rayLenCm;
    const ry = sim.pose.y + Math.sin(sim.pose.theta) * rayLenCm;
    const fx = sim.pose.x + Math.cos(sim.pose.theta) * 14;
    const fy = sim.pose.y + Math.sin(sim.pose.theta) * 14;

    ctx.strokeStyle =
      sim.distanceSensor.distanceMm < 260
        ? 'rgba(248, 113, 113, 0.85)'
        : 'rgba(52, 211, 153, 0.65)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(fx * scale, fy * scale);
    ctx.lineTo(rx * scale, ry * scale);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = sim.distanceSensor.distanceMm < 260 ? '#f87171' : '#34d399';
    ctx.beginPath();
    ctx.arc(rx * scale, ry * scale, 4, 0, Math.PI * 2);
    ctx.fill();

    // bro_bot chassis (rear-wheel drive + manipulator base)
    ctx.save();
    ctx.translate(sim.pose.x * scale, sim.pose.y * scale);
    ctx.rotate(sim.pose.theta);

    const chassisL = 28 * scale;
    const chassisW = 22 * scale;

    // Chassis frame
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.fillRect(-chassisL / 2, -chassisW / 2, chassisL, chassisW);
    ctx.strokeRect(-chassisL / 2, -chassisW / 2, chassisL, chassisW);

    // Rear wheels (VEX5_PORT_6 Left = -Y in local coords, VEX5_PORT_1 Right = +Y in local coords)
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    // Left rear wheel (PORT 6)
    ctx.fillRect(-chassisL / 2 + 2, -chassisW / 2 - 5, 14, 5);
    ctx.strokeRect(-chassisL / 2 + 2, -chassisW / 2 - 5, 14, 5);
    // Right rear wheel (PORT 1)
    ctx.fillRect(-chassisL / 2 + 2, chassisW / 2, 14, 5);
    ctx.strokeRect(-chassisL / 2 + 2, chassisW / 2, 14, 5);

    // Front caster + sensors
    ctx.fillStyle = '#34d399';
    ctx.fillRect(chassisL / 2 - 3, -4, 4, 8);

    // Optical sensor LED spot
    if (sim.opticalSensor.ledOn) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(4, 0, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Manipulator turret direction indicator (J1 Base Yaw)
    const baseYawRad = (sim.armJoints[0].currentDeg * Math.PI) / 180;
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(baseYawRad) * 16, Math.sin(baseYawRad) * 16);
    ctx.stroke();

    ctx.restore();
  }, [sim]);

  // Draw 6-DOF Dynamixel Arm Side Profile
  useEffect(() => {
    const canvas = armCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Ground plane
    const baseX = 72;
    const baseY = canvas.height - 28;
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(12, baseY);
    ctx.lineTo(canvas.width - 12, baseY);
    ctx.stroke();

    // Base pedestal
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(baseX - 22, baseY - 14, 44, 14);
    ctx.strokeStyle = '#64748b';
    ctx.strokeRect(baseX - 22, baseY - 14, 44, 14);

    // Forward kinematics in side plane (J2 Shoulder, J3 Elbow, J4 Wrist Pitch)
    const j2 = ((90 - sim.armJoints[1].currentDeg) * Math.PI) / 180;
    const j3 = j2 - (sim.armJoints[2].currentDeg * Math.PI) / 180;
    const j4 = j3 - (sim.armJoints[3].currentDeg * Math.PI) / 180;

    const l1 = 58;
    const l2 = 52;
    const l3 = 30;

    const p0 = { x: baseX, y: baseY - 14 };
    const p1 = { x: p0.x + Math.cos(j2) * l1, y: p0.y - Math.sin(j2) * l1 };
    const p2 = { x: p1.x + Math.cos(j3) * l2, y: p1.y - Math.sin(j3) * l2 };
    const p3 = { x: p2.x + Math.cos(j4) * l3, y: p2.y - Math.sin(j4) * l3 };

    const drawLink = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      color: string,
      width: number
    ) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    };

    drawLink(p0, p1, '#38bdf8', 7);
    drawLink(p1, p2, '#818cf8', 6);
    drawLink(p2, p3, '#c084fc', 4);

    // Gripper jaws (J6)
    const gripOpen = (sim.armJoints[5].currentDeg / 90) * 10 + 3;
    const perpX = -Math.sin(j4);
    const perpY = -Math.cos(j4);
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p3.x + perpX * gripOpen, p3.y + perpY * gripOpen);
    ctx.lineTo(
      p3.x + Math.cos(j4) * 14 + perpX * (gripOpen * 0.7),
      p3.y - Math.sin(j4) * 14 + perpY * (gripOpen * 0.7)
    );
    ctx.moveTo(p3.x - perpX * gripOpen, p3.y - perpY * gripOpen);
    ctx.lineTo(
      p3.x + Math.cos(j4) * 14 - perpX * (gripOpen * 0.7),
      p3.y - Math.sin(j4) * 14 - perpY * (gripOpen * 0.7)
    );
    ctx.stroke();

    // Joint circles
    [p0, p1, p2, p3].forEach((pt, idx) => {
      ctx.fillStyle = '#0f172a';
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, idx === 0 ? 6 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px ui-monospace, SFMono-Regular, monospace';
    ctx.fillText(`Base Yaw: ${sim.armJoints[0].currentDeg.toFixed(0)}°`, 12, 18);
    ctx.fillText(`Roll: ${sim.armJoints[4].currentDeg.toFixed(0)}°`, 12, 33);
    ctx.fillText(`Grip: ${sim.armJoints[5].currentDeg.toFixed(0)}°`, 12, 48);
  }, [sim.armJoints]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">
              bro_bot 2D Arena &amp; Sensor Field (400 × 260 cm)
            </h2>
            <p className="text-xs text-slate-400">
              Rear-wheel drive: VEX5_PORT_1 (Right) &amp; VEX5_PORT_6 (Left) · Pose (
              {sim.pose.x.toFixed(0)} cm, {sim.pose.y.toFixed(0)} cm,{' '}
              {((sim.pose.theta * 180) / Math.PI).toFixed(0)}°)
            </p>
          </div>
          <button
            type="button"
            onClick={onResetPose}
            className="px-2.5 py-1 text-xs font-medium rounded-md border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 transition-colors"
          >
            Reset Arena Pose
          </button>
        </div>

        <canvas
          ref={arenaCanvasRef}
          width={640}
          height={416}
          className="w-full h-auto rounded-lg border border-slate-800 bg-slate-950"
        />
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 flex flex-col justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 mb-1">
            6-DOF Dynamixel Arm Profile
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Angular manipulator kinematics (Base, Shoulder, Elbow, Wrist, Gripper)
          </p>
          <canvas
            ref={armCanvasRef}
            width={280}
            height={210}
            className="w-full h-auto rounded-lg border border-slate-800 bg-slate-950 mb-3"
          />
        </div>

        {/* Live Vex5_Distance & Vex5_Optical readout */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="text-slate-400 mb-1">Vex5_Distance (P2)</div>
            <div className="text-base font-mono font-semibold text-emerald-400">
              {sim.distanceSensor.distanceMm} mm
            </div>
            <div className="text-[11px] text-slate-500">
              {sim.distanceSensor.distanceMm < 260 ? 'PROXIMITY ALERT' : 'Path Clear'}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-2.5">
            <div className="text-slate-400 mb-1">Vex5_Optical (P7)</div>
            <div className="flex items-center gap-1.5 font-mono text-slate-200">
              <span
                className="inline-block w-3 h-3 rounded-sm border border-slate-700"
                style={{
                  backgroundColor: `rgb(${Math.min(255, Math.round(sim.opticalSensor.red / 4))}, ${Math.min(255, Math.round(sim.opticalSensor.green / 4))}, ${Math.min(255, Math.round(sim.opticalSensor.blue / 4))})`,
                }}
              />
              <span>
                {sim.opticalSensor.red}/{sim.opticalSensor.green}/{sim.opticalSensor.blue}
              </span>
            </div>
            <div className="text-[11px] text-slate-500">
              Bright: {sim.opticalSensor.brightness} · Dir: ({sim.opticalSensor.dirX},{' '}
              {sim.opticalSensor.dirY})
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
