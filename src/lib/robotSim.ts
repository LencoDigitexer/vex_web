import { Vex5Port, degToTicks } from './vex5Protocol';

export type SketchPresetId =
  | 'manual'
  | 'motor_position_90'
  | 'two_motors_forward_back'
  | 'optical_parktronic';

export interface MotorState {
  port: Vex5Port;
  label: string;
  controlMode: 'speed' | 'position' | 'free';
  goalSpeed: number; // raw Vex5 speed units (-2300..2300, power * 23)
  goalPositionTicks: number;
  maxSpeed: number;
  maxCurrentMa: number; // 0 = unlimited
  realSpeed: number;
  realPositionTicks: number;
  realPower: number; // -100..100%
  currentDrawMa: number;
}

export interface ArmJointState {
  id: number;
  name: string;
  targetDeg: number;
  currentDeg: number;
  minDeg: number;
  maxDeg: number;
  loadPct: number;
}

export interface DistanceSensorState {
  port: Vex5Port;
  distanceMm: number; // 20..2000 mm
}

export interface OpticalSensorState {
  port: Vex5Port;
  ledOn: boolean;
  directionMode: boolean;
  red: number;
  green: number;
  blue: number;
  brightness: number;
  range: number;
  dirX: number;
  dirY: number;
  rawDirection: number; // 0=none,1=up,2=down,3=right,4=left
}

export interface ArenaObstacle {
  id: string;
  x: number; // cm in arena (0..400)
  y: number; // cm in arena (0..260)
  w: number;
  h: number;
  label: string;
}

export interface ArenaColorZone {
  id: string;
  x: number;
  y: number;
  radius: number;
  name: string;
  r: number;
  g: number;
  b: number;
}

export interface RobotPose {
  x: number; // cm (0..400)
  y: number; // cm (0..260)
  theta: number; // radians
  trail: Array<{ x: number; y: number }>;
}

export interface RobotSimState {
  hwVersion: 0 | 5;
  preset: SketchPresetId;
  running: boolean;
  elapsedMs: number;
  lastStepMs: number;
  pose: RobotPose;
  rightMotor: MotorState; // VEX5_PORT_1 per README.md
  leftMotor: MotorState; // VEX5_PORT_6 per README.md
  armJoints: ArmJointState[]; // 6 Dynamixel motors per README.md
  distanceSensor: DistanceSensorState;
  opticalSensor: OpticalSensorState;
  obstacles: ArenaObstacle[];
  colorZones: ArenaColorZone[];
}

export const ARENA_WIDTH_CM = 400;
export const ARENA_HEIGHT_CM = 260;

export const INITIAL_OBSTACLES: ArenaObstacle[] = [
  { id: 'obs-1', x: 270, y: 95, w: 34, h: 70, label: 'Target Crate' },
  { id: 'obs-2', x: 110, y: 40, w: 55, h: 24, label: 'Barrier A' },
  { id: 'obs-3', x: 165, y: 195, w: 45, h: 30, label: 'Barrier B' },
];

export const INITIAL_COLOR_ZONES: ArenaColorZone[] = [
  { id: 'zone-red', x: 85, y: 130, radius: 28, name: 'Red Marker', r: 920, g: 140, b: 120 },
  { id: 'zone-green', x: 210, y: 75, radius: 28, name: 'Green Marker', r: 160, g: 890, b: 210 },
  { id: 'zone-blue', x: 225, y: 165, radius: 28, name: 'Blue Marker', r: 130, g: 240, b: 940 },
];

export function createInitialArmJoints(): ArmJointState[] {
  return [
    { id: 1, name: 'ID 1 · Base Yaw', targetDeg: 0, currentDeg: 0, minDeg: -150, maxDeg: 150, loadPct: 4 },
    { id: 2, name: 'ID 2 · Shoulder', targetDeg: 35, currentDeg: 35, minDeg: -90, maxDeg: 120, loadPct: 18 },
    { id: 3, name: 'ID 3 · Elbow', targetDeg: -55, currentDeg: -55, minDeg: -135, maxDeg: 90, loadPct: 14 },
    { id: 4, name: 'ID 4 · Wrist Pitch', targetDeg: -20, currentDeg: -20, minDeg: -110, maxDeg: 110, loadPct: 7 },
    { id: 5, name: 'ID 5 · Wrist Roll', targetDeg: 0, currentDeg: 0, minDeg: -180, maxDeg: 180, loadPct: 2 },
    { id: 6, name: 'ID 6 · Gripper', targetDeg: 40, currentDeg: 40, minDeg: 0, maxDeg: 90, loadPct: 9 },
  ];
}

export function createInitialSimState(): RobotSimState {
  return {
    hwVersion: 5,
    preset: 'manual',
    running: true,
    elapsedMs: 0,
    lastStepMs: 0,
    pose: {
      x: 135,
      y: 130,
      theta: 0,
      trail: [{ x: 135, y: 130 }],
    },
    rightMotor: {
      port: Vex5Port.VEX5_PORT_1,
      label: 'Right Wheel (VEX5_PORT_1)',
      controlMode: 'speed',
      goalSpeed: 0,
      goalPositionTicks: 0,
      maxSpeed: 200,
      maxCurrentMa: 0,
      realSpeed: 0,
      realPositionTicks: 0,
      realPower: 0,
      currentDrawMa: 120,
    },
    leftMotor: {
      port: Vex5Port.VEX5_PORT_6,
      label: 'Left Wheel (VEX5_PORT_6)',
      controlMode: 'speed',
      goalSpeed: 0,
      goalPositionTicks: 0,
      maxSpeed: 200,
      maxCurrentMa: 0,
      realSpeed: 0,
      realPositionTicks: 0,
      realPower: 0,
      currentDrawMa: 120,
    },
    armJoints: createInitialArmJoints(),
    distanceSensor: {
      port: Vex5Port.VEX5_PORT_2,
      distanceMm: 1350,
    },
    opticalSensor: {
      port: Vex5Port.VEX5_PORT_7,
      ledOn: true,
      directionMode: true,
      red: 310,
      green: 325,
      blue: 340,
      brightness: 420,
      range: 210,
      dirX: 0,
      dirY: 0,
      rawDirection: 0,
    },
    obstacles: INITIAL_OBSTACLES,
    colorZones: INITIAL_COLOR_ZONES,
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function raycastDistanceMm(
  x: number,
  y: number,
  theta: number,
  obstacles: ArenaObstacle[]
): number {
  const maxRangeCm = 200; // 2000 mm
  const stepCm = 1.5;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);

  // Front sensor offset ~14 cm ahead of robot center
  for (let d = 14; d <= maxRangeCm; d += stepCm) {
    const px = x + cos * d;
    const py = y + sin * d;

    if (px <= 4 || px >= ARENA_WIDTH_CM - 4 || py <= 4 || py >= ARENA_HEIGHT_CM - 4) {
      return Math.round((d - 14) * 10);
    }

    for (const obs of obstacles) {
      if (px >= obs.x && px <= obs.x + obs.w && py >= obs.y && py <= obs.y + obs.h) {
        return Math.round((d - 14) * 10);
      }
    }
  }
  return 2000;
}

function updateMotorPhysics(motor: MotorState, dtSec: number): MotorState {
  let targetSpeed = 0;
  if (motor.controlMode === 'speed') {
    targetSpeed = clamp(motor.goalSpeed, -2300, 2300);
  } else if (motor.controlMode === 'position') {
    const err = motor.goalPositionTicks - motor.realPositionTicks;
    if (Math.abs(err) < 2) {
      targetSpeed = 0;
    } else {
      const cap = Math.max(40, Math.abs(motor.maxSpeed));
      targetSpeed = clamp(err * 4.2, -cap, cap);
    }
  } else {
    targetSpeed = motor.realSpeed * 0.85;
  }

  // Smooth acceleration toward targetSpeed
  const alpha = clamp(dtSec * 8, 0, 1);
  let realSpeed = motor.realSpeed + (targetSpeed - motor.realSpeed) * alpha;
  if (Math.abs(realSpeed) < 0.8 && Math.abs(targetSpeed) < 0.8) {
    realSpeed = 0;
  }

  // Current limiting if maxCurrentMa > 0
  const estimatedCurrent = Math.round(110 + Math.abs(realSpeed) * 1.15);
  const currentDrawMa =
    motor.maxCurrentMa > 0 ? Math.min(estimatedCurrent, motor.maxCurrentMa) : estimatedCurrent;

  const scaleFactor =
    motor.maxCurrentMa > 0 && estimatedCurrent > motor.maxCurrentMa
      ? motor.maxCurrentMa / estimatedCurrent
      : 1;

  realSpeed = realSpeed * scaleFactor;
  const realPositionTicks = motor.realPositionTicks + realSpeed * 0.45 * dtSec;
  const realPower = clamp(Math.round(realSpeed / 23), -100, 100);

  return {
    ...motor,
    realSpeed: Math.round(realSpeed),
    realPositionTicks: Math.round(realPositionTicks),
    realPower,
    currentDrawMa,
  };
}

export interface StepResult {
  nextState: RobotSimState;
  serialLines: string[];
}

export function stepSimulation(state: RobotSimState, dtMs: number): StepResult {
  if (!state.running) {
    return { nextState: state, serialLines: [] };
  }

  const dtSec = clamp(dtMs / 1000, 0.005, 0.1);
  const elapsedMs = state.elapsedMs + dtMs;
  const serialLines: string[] = [];
  let lastStepMs = state.lastStepMs;

  let rightMotor = { ...state.rightMotor };
  let leftMotor = { ...state.leftMotor };

  // Execute preset sketch logic faithfully from README.md & VexV5-main/examples
  if (state.preset === 'motor_position_90') {
    if (elapsedMs - lastStepMs > 1000 && Math.abs(rightMotor.realSpeed) < 3) {
      lastStepMs = elapsedMs;
      rightMotor.controlMode = 'position';
      leftMotor.controlMode = 'position';
      const deltaTicks = Math.round(degToTicks(90));
      rightMotor.goalPositionTicks += deltaTicks;
      leftMotor.goalPositionTicks += deltaTicks;
      rightMotor.maxSpeed = 200;
      leftMotor.maxSpeed = 200;
      serialLines.push(
        `Goal Position:\t${rightMotor.goalPositionTicks}\tReal Position Speed Power:\t${rightMotor.realPositionTicks}\t${rightMotor.realSpeed}\t${rightMotor.realPower}`
      );
    }
  } else if (state.preset === 'two_motors_forward_back') {
    if (elapsedMs - lastStepMs > 1400) {
      lastStepMs = elapsedMs;
      rightMotor.controlMode = 'speed';
      leftMotor.controlMode = 'speed';
      if (rightMotor.goalSpeed === 0 && leftMotor.goalSpeed === 0) {
        rightMotor.goalSpeed = 200;
        leftMotor.goalSpeed = 300;
      } else {
        rightMotor.goalSpeed = -rightMotor.goalSpeed;
        leftMotor.goalSpeed = -leftMotor.goalSpeed;
      }
      serialLines.push(
        `Pos[0]: ${rightMotor.realPositionTicks}\tSpeed[0]: ${rightMotor.realSpeed}\tPower[0]: ${rightMotor.realPower}\tPos[1]: ${leftMotor.realPositionTicks}\tSpeed[1]: ${leftMotor.realSpeed}\tPower[1]: ${leftMotor.realPower}`
      );
    }
  } else if (state.preset === 'optical_parktronic') {
    rightMotor.controlMode = 'speed';
    leftMotor.controlMode = 'speed';
    const dist = state.distanceSensor.distanceMm;
    if (dist < 240) {
      rightMotor.goalSpeed = -120;
      leftMotor.goalSpeed = 120; // turn away from obstacle
    } else if (dist < 420) {
      rightMotor.goalSpeed = 120;
      leftMotor.goalSpeed = 120; // slow approach
    } else {
      rightMotor.goalSpeed = 280;
      leftMotor.goalSpeed = 280; // cruise forward
    }
    if (elapsedMs - lastStepMs > 700) {
      lastStepMs = elapsedMs;
      serialLines.push(
        `length = ${dist} mm | RGB=(${state.opticalSensor.red}, ${state.opticalSensor.green}, ${state.opticalSensor.blue}) | brightness=${state.opticalSensor.brightness}`
      );
    }
  }

  rightMotor = updateMotorPhysics(rightMotor, dtSec);
  leftMotor = updateMotorPhysics(leftMotor, dtSec);

  // Differential drive kinematics (rear-wheel drive: VEX5_PORT_1 = right, VEX5_PORT_6 = left)
  const vRightCm = (rightMotor.realSpeed / 230) * 28; // cm/s
  const vLeftCm = (leftMotor.realSpeed / 230) * 28; // cm/s
  const wheelbaseCm = 22;
  const linearV = (vRightCm + vLeftCm) / 2;
  const omega = (vRightCm - vLeftCm) / wheelbaseCm;

  let nextTheta = state.pose.theta + omega * dtSec;
  // Normalize theta to [-PI, PI]
  while (nextTheta > Math.PI) nextTheta -= Math.PI * 2;
  while (nextTheta < -Math.PI) nextTheta += Math.PI * 2;

  let nextX = state.pose.x + Math.cos(nextTheta) * linearV * dtSec;
  let nextY = state.pose.y + Math.sin(nextTheta) * linearV * dtSec;

  // Keep inside arena bounds (robot radius ~15 cm)
  const margin = 16;
  nextX = clamp(nextX, margin, ARENA_WIDTH_CM - margin);
  nextY = clamp(nextY, margin, ARENA_HEIGHT_CM - margin);

  // Prevent driving through obstacles
  for (const obs of state.obstacles) {
    const closestX = clamp(nextX, obs.x, obs.x + obs.w);
    const closestY = clamp(nextY, obs.y, obs.y + obs.h);
    const dx = nextX - closestX;
    const dy = nextY - closestY;
    const distSq = dx * dx + dy * dy;
    const minDist = 14;
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const d = Math.sqrt(distSq);
      nextX = closestX + (dx / d) * minDist;
      nextY = closestY + (dy / d) * minDist;
    }
  }

  const prevTrail = state.pose.trail;
  const lastPt = prevTrail[prevTrail.length - 1];
  const movedDist = Math.hypot(nextX - lastPt.x, nextY - lastPt.y);
  const trail =
    movedDist > 4 ? [...prevTrail.slice(-140), { x: nextX, y: nextY }] : prevTrail;

  // Update 6-DOF Dynamixel manipulator joints smoothly
  const armJoints = state.armJoints.map((j) => {
    const diff = j.targetDeg - j.currentDeg;
    const step = clamp(diff, -120 * dtSec, 120 * dtSec);
    const currentDeg = Math.abs(diff) < 0.2 ? j.targetDeg : j.currentDeg + step;
    const loadPct = clamp(
      Math.round(4 + Math.abs(diff) * 0.6 + (j.id === 2 || j.id === 3 ? 12 : 2)),
      2,
      98
    );
    return { ...j, currentDeg: Number(currentDeg.toFixed(1)), loadPct };
  });

  // Update Vex5_Distance sensor
  const distanceMm = raycastDistanceMm(nextX, nextY, nextTheta, state.obstacles);

  // Update Vex5_Optical sensor based on floor color zones & motion direction
  let red = state.opticalSensor.ledOn ? 310 : 95;
  let green = state.opticalSensor.ledOn ? 325 : 100;
  let blue = state.opticalSensor.ledOn ? 340 : 105;

  for (const zone of state.colorZones) {
    const d = Math.hypot(nextX - zone.x, nextY - zone.y);
    if (d < zone.radius) {
      const blend = 1 - d / zone.radius;
      const ledBoost = state.opticalSensor.ledOn ? 1 : 0.45;
      red = Math.round((red + (zone.r - red) * blend) * ledBoost);
      green = Math.round((green + (zone.g - green) * blend) * ledBoost);
      blue = Math.round((blue + (zone.b - blue) * blend) * ledBoost);
    }
  }

  const brightness = Math.round((red + green + blue) / 3 + (state.opticalSensor.ledOn ? 120 : 10));
  const range = clamp(Math.round(255 - clamp(distanceMm / 8, 0, 255)), 0, 255);

  let rawDirection = 0;
  let dirX = 0;
  let dirY = 0;
  if (state.opticalSensor.directionMode && Math.abs(linearV) > 1.5) {
    if (Math.abs(Math.cos(nextTheta)) >= Math.abs(Math.sin(nextTheta))) {
      rawDirection = Math.cos(nextTheta) * linearV > 0 ? 3 : 4;
      dirX = rawDirection === 3 ? 1 : -1;
    } else {
      rawDirection = Math.sin(nextTheta) * linearV > 0 ? 2 : 1;
      dirY = rawDirection === 2 ? -1 : 1;
    }
  }

  return {
    nextState: {
      ...state,
      elapsedMs,
      lastStepMs,
      pose: { x: nextX, y: nextY, theta: nextTheta, trail },
      rightMotor,
      leftMotor,
      armJoints,
      distanceSensor: { ...state.distanceSensor, distanceMm },
      opticalSensor: {
        ...state.opticalSensor,
        red,
        green,
        blue,
        brightness,
        range,
        dirX,
        dirY,
        rawDirection,
      },
    },
    serialLines,
  };
}
