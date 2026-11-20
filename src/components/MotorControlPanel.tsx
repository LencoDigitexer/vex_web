import React, { useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, RotateCcw, Square } from 'lucide-react';
import { MotorState } from '../lib/robotSim';
import { ticksToDeg } from '../lib/vex5Protocol';

interface MotorControlPanelProps {
  rightMotor: MotorState;
  leftMotor: MotorState;
  onDriveVector: (leftSpeed: number, rightSpeed: number, label: string) => void;
  onSetMotorPosition: (side: 'left' | 'right', deltaDeg: number, maxSpeed: number) => void;
  onSetMaxCurrent: (side: 'left' | 'right', maxCurrentMa: number) => void;
  onResetEncoder: (side: 'left' | 'right') => void;
}

export const MotorControlPanel: React.FC<MotorControlPanelProps> = ({
  rightMotor,
  leftMotor,
  onDriveVector,
  onSetMotorPosition,
  onSetMaxCurrent,
  onResetEncoder,
}) => {
  const [driveSpeed, setDriveSpeed] = useState<number>(260);
  const [stepAngleDeg, setStepAngleDeg] = useState<number>(90);
  const [maxCurrentInput, setMaxCurrentInput] = useState<number>(0);

  const renderMotorCard = (side: 'left' | 'right', motor: MotorState) => (
    <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold text-slate-200">{motor.label}</div>
          <div className="text-[11px] text-slate-400">
            Mode: <span className="font-mono text-sky-400">{motor.controlMode}</span> · MaxCur:{' '}
            <span className="font-mono">{motor.maxCurrentMa === 0 ? 'Unlimited' : `${motor.maxCurrentMa} mA`}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onResetEncoder(side)}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          <RotateCcw className="w-3 h-3" />
          Reset Enc
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2 text-xs font-mono">
        <div className="rounded bg-slate-900 p-2 border border-slate-800/80">
          <div className="text-[10px] text-slate-500">POS (ticks)</div>
          <div className="text-slate-100">{motor.realPositionTicks}</div>
          <div className="text-[10px] text-slate-400">
            {ticksToDeg(motor.realPositionTicks).toFixed(0)}°
          </div>
        </div>
        <div className="rounded bg-slate-900 p-2 border border-slate-800/80">
          <div className="text-[10px] text-slate-500">SPEED</div>
          <div className="text-sky-400">{motor.realSpeed}</div>
          <div className="text-[10px] text-slate-400">goal {motor.goalSpeed}</div>
        </div>
        <div className="rounded bg-slate-900 p-2 border border-slate-800/80">
          <div className="text-[10px] text-slate-500">POWER</div>
          <div className="text-amber-400">{motor.realPower}%</div>
          <div className="text-[10px] text-slate-400">pwm</div>
        </div>
        <div className="rounded bg-slate-900 p-2 border border-slate-800/80">
          <div className="text-[10px] text-slate-500">CURRENT</div>
          <div className="text-emerald-400">{motor.currentDrawMa}</div>
          <div className="text-[10px] text-slate-400">mA</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => onSetMotorPosition(side, stepAngleDeg, 200)}
          className="px-2.5 py-1 text-xs rounded bg-sky-600/20 border border-sky-500/40 text-sky-300 hover:bg-sky-600/30"
        >
          setPosition(+{stepAngleDeg}°)
        </button>
        <button
          type="button"
          onClick={() => onSetMotorPosition(side, -stepAngleDeg, 200)}
          className="px-2.5 py-1 text-xs rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
        >
          setPosition(-{stepAngleDeg}°)
        </button>
        <button
          type="button"
          onClick={() => onSetMaxCurrent(side, maxCurrentInput)}
          className="px-2.5 py-1 text-xs rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700"
        >
          Apply MaxCurrent
        </button>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Vex5_Motor Differential Drive &amp; Encoders
          </h2>
          <p className="text-xs text-slate-400">
            Direct motor telemetry and differential drive commands (WASD / Arrow keys supported)
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-slate-300">
            <span>Speed:</span>
            <input
              type="number"
              min={50}
              max={1500}
              step={25}
              value={driveSpeed}
              onChange={(e) => setDriveSpeed(Number(e.target.value) || 200)}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-300">
            <span>Step (°):</span>
            <input
              type="number"
              min={15}
              max={720}
              step={15}
              value={stepAngleDeg}
              onChange={(e) => setStepAngleDeg(Number(e.target.value) || 90)}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-300">
            <span>Max mA:</span>
            <input
              type="number"
              min={0}
              max={2500}
              step={100}
              value={maxCurrentInput}
              onChange={(e) => setMaxCurrentInput(Math.max(0, Number(e.target.value) || 0))}
              className="w-16 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-slate-100"
            />
          </label>
        </div>
      </div>

      {/* Drive Pad + Motor Cards */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-center">
        <div className="xl:col-span-3 flex flex-col items-center justify-center rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="text-[11px] font-medium text-slate-400 mb-2">
            Manual Drive Pad
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <div />
            <button
              type="button"
              onClick={() => onDriveVector(driveSpeed, driveSpeed, 'Forward')}
              className="p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-sky-600/30 hover:border-sky-500/50 text-slate-100"
              title="Forward (W / Up)"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <div />
            <button
              type="button"
              onClick={() => onDriveVector(-driveSpeed * 0.7, driveSpeed * 0.7, 'Turn Left')}
              className="p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-sky-600/30 hover:border-sky-500/50 text-slate-100"
              title="Turn Left (A / Left)"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDriveVector(0, 0, 'Stop')}
              className="p-2.5 rounded-lg border border-rose-500/40 bg-rose-500/15 hover:bg-rose-500/30 text-rose-300"
              title="Stop (Space)"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDriveVector(driveSpeed * 0.7, -driveSpeed * 0.7, 'Turn Right')}
              className="p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-sky-600/30 hover:border-sky-500/50 text-slate-100"
              title="Turn Right (D / Right)"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div />
            <button
              type="button"
              onClick={() => onDriveVector(-driveSpeed, -driveSpeed, 'Reverse')}
              className="p-2.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-sky-600/30 hover:border-sky-500/50 text-slate-100"
              title="Reverse (S / Down)"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
            <div />
          </div>
        </div>

        <div className="xl:col-span-9 grid grid-cols-1 md:grid-cols-2 gap-3">
          {renderMotorCard('left', leftMotor)}
          {renderMotorCard('right', rightMotor)}
        </div>
      </div>
    </div>
  );
};
