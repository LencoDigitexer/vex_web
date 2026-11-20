import React from 'react';
import { ArmJointState } from '../lib/robotSim';

interface ManipulatorPanelProps {
  joints: ArmJointState[];
  onChangeJoint: (id: number, targetDeg: number) => void;
  onApplyArmPose: (poseName: string, angles: number[]) => void;
}

const ARM_POSES: Array<{ name: string; angles: number[] }> = [
  { name: 'Home', angles: [0, 35, -55, -20, 0, 40] },
  { name: 'Reach', angles: [0, 68, -22, -45, 0, 75] },
  { name: 'Pickup', angles: [0, 82, -10, -72, 0, 12] },
  { name: 'Stow', angles: [0, -35, -110, 60, 0, 5] },
];

export const ManipulatorPanel: React.FC<ManipulatorPanelProps> = ({
  joints,
  onChangeJoint,
  onApplyArmPose,
}) => {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            6-DOF Dynamixel Manipulator Control
          </h2>
          <p className="text-xs text-slate-400">
            6 angular servos with target angles, live position tracking, and estimated torque load
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {ARM_POSES.map((pose) => (
            <button
              key={pose.name}
              type="button"
              onClick={() => onApplyArmPose(pose.name, pose.angles)}
              className="px-2.5 py-1 text-xs rounded border border-slate-700 bg-slate-800 hover:bg-indigo-600/30 hover:border-indigo-500/50 text-slate-200"
            >
              {pose.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {joints.map((joint) => (
          <div
            key={joint.id}
            className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 space-y-2"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-200">{joint.name}</span>
              <span className="font-mono text-indigo-300">
                {joint.currentDeg.toFixed(0)}° / {joint.targetDeg}°
              </span>
            </div>

            <input
              type="range"
              min={joint.minDeg}
              max={joint.maxDeg}
              value={joint.targetDeg}
              onChange={(e) => onChangeJoint(joint.id, Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />

            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
              <span>{joint.minDeg}°</span>
              <span>Load: {joint.loadPct}%</span>
              <span>{joint.maxDeg}°</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
