import { Team, TrajectoryPoint, LandingPoint, NetCrossing } from "./types";

export const STANDARD_COURT_LENGTH = 18;
export const STANDARD_COURT_WIDTH = 9;
export const STANDARD_NET_HEIGHT_MEN = 2.43;
export const STANDARD_NET_HEIGHT_WOMEN = 2.24;
export const LINE_WIDTH = 0.05;
export const ANTENNA_OFFSET = 0.8;
export const EPSILON = 1e-6;

export interface CourtConfig {
  length: number;
  width: number;
  netHeight: number;
}

export function getDefaultCourt(): CourtConfig {
  return {
    length: STANDARD_COURT_LENGTH,
    width: STANDARD_COURT_WIDTH,
    netHeight: STANDARD_NET_HEIGHT_WOMEN,
  };
}

export function getNetX(): number {
  return STANDARD_COURT_LENGTH / 2;
}

export function getSideOfPoint(
  x: number,
  courtLength: number = STANDARD_COURT_LENGTH,
): Team {
  const netX = courtLength / 2;
  return x < netX ? "A" : "B";
}

export function isInBounds(
  x: number,
  y: number,
  court: CourtConfig,
): {
  inBounds: boolean;
  onLine: boolean;
} {
  const halfWidth = court.width / 2;
  const tolerance = LINE_WIDTH / 2;

  const xStrict =
    x >= -tolerance - EPSILON && x <= court.length + tolerance + EPSILON;
  const yStrict =
    y >= -halfWidth - tolerance - EPSILON &&
    y <= halfWidth + tolerance + EPSILON;

  const xOnEndLine =
    (x >= -tolerance - EPSILON && x <= tolerance + EPSILON) ||
    (x >= court.length - tolerance - EPSILON &&
      x <= court.length + tolerance + EPSILON);
  const yOnSideline =
    (y >= -halfWidth - tolerance - EPSILON &&
      y <= -halfWidth + tolerance + EPSILON) ||
    (y >= halfWidth - tolerance - EPSILON &&
      y <= halfWidth + tolerance + EPSILON);

  const onLine = xOnEndLine || yOnSideline;
  const inBounds = xStrict && yStrict;

  return { inBounds, onLine };
}

export function isOnSideline(y: number, court: CourtConfig): boolean {
  const halfWidth = court.width / 2;
  const tolerance = LINE_WIDTH / 2;
  return (
    (y >= -halfWidth - tolerance - EPSILON &&
      y <= -halfWidth + tolerance + EPSILON) ||
    (y >= halfWidth - tolerance - EPSILON &&
      y <= halfWidth + tolerance + EPSILON)
  );
}

export function isOnEndLine(x: number, court: CourtConfig): boolean {
  const tolerance = LINE_WIDTH / 2;
  return (
    (x >= -tolerance - EPSILON && x <= tolerance + EPSILON) ||
    (x >= court.length - tolerance - EPSILON &&
      x <= court.length + tolerance + EPSILON)
  );
}

export function hitsAntenna(x: number, y: number, court: CourtConfig): boolean {
  const netX = court.length / 2;
  const antennaY = court.width / 2 + ANTENNA_OFFSET;
  const tolerance = 0.1;

  if (Math.abs(x - netX) > tolerance + EPSILON) return false;

  return Math.abs(Math.abs(y) - antennaY) <= tolerance + EPSILON;
}

export function isOutsideAntenna(y: number, court: CourtConfig): boolean {
  const antennaY = court.width / 2 + ANTENNA_OFFSET;
  return Math.abs(y) > antennaY + EPSILON;
}

export function crossesNet(
  p1: TrajectoryPoint,
  p2: TrajectoryPoint,
  court: CourtConfig,
): NetCrossing | null {
  const netX = court.length / 2;

  const x1 = p1.x;
  const x2 = p2.x;

  const crosses = (x1 - netX) * (x2 - netX) <= 0;
  if (!crosses) return null;

  if (Math.abs(x2 - x1) < EPSILON) {
    const cleared = Math.max(p1.z, p2.z) > court.netHeight;
    const avgY = (p1.y + p2.y) / 2;
    const antenna = hitsAntenna(netX, avgY, court);
    return {
      time: (p1.t + p2.t) / 2,
      height: (p1.z + p2.z) / 2,
      x: netX,
      cleared,
      hitAntenna: antenna,
    };
  }

  const t = (netX - x1) / (x2 - x1);
  const crossTime = p1.t + t * (p2.t - p1.t);
  const crossHeight = p1.z + t * (p2.z - p1.z);
  const crossY = p1.y + t * (p2.y - p1.y);

  const cleared = crossHeight > court.netHeight + EPSILON;
  const antenna = hitsAntenna(netX, crossY, court);

  return {
    time: crossTime,
    height: crossHeight,
    x: netX,
    cleared,
    hitAntenna: antenna,
  };
}

export function findLanding(
  p1: TrajectoryPoint,
  p2: TrajectoryPoint,
  court: CourtConfig,
): LandingPoint | null {
  if (p1.z > 0 && p2.z > 0) return null;
  if (p1.z <= 0 && p2.z <= 0) {
    const z1 = Math.min(p1.z, p2.z);
    if (z1 > EPSILON) return null;
  }

  if (Math.abs(p2.z - p1.z) < EPSILON) {
    if (p1.z > EPSILON) return null;
    const t = 0;
    const landX = p1.x + t * (p2.x - p1.x);
    const landY = p1.y + t * (p2.y - p1.y);
    const bounds = isInBounds(landX, landY, court);
    const teamSide = getSideOfPoint(landX, court.length);
    return {
      time: p1.t + t * (p2.t - p1.t),
      x: landX,
      y: landY,
      inBounds: bounds.inBounds,
      onLine: bounds.onLine,
      teamSide,
    };
  }

  const t = -p1.z / (p2.z - p1.z);
  if (t < -EPSILON || t > 1 + EPSILON) return null;

  const clampedT = Math.max(0, Math.min(1, t));
  const landTime = p1.t + clampedT * (p2.t - p1.t);
  const landX = p1.x + clampedT * (p2.x - p1.x);
  const landY = p1.y + clampedT * (p2.y - p1.y);

  const bounds = isInBounds(landX, landY, court);
  const teamSide = getSideOfPoint(landX, court.length);

  return {
    time: landTime,
    x: landX,
    y: landY,
    inBounds: bounds.inBounds,
    onLine: bounds.onLine,
    teamSide,
  };
}

export function interpolateAtTime(
  p1: TrajectoryPoint,
  p2: TrajectoryPoint,
  targetTime: number,
): TrajectoryPoint {
  if (Math.abs(p2.t - p1.t) < EPSILON) {
    return { ...p1 };
  }
  const t = (targetTime - p1.t) / (p2.t - p1.t);
  return {
    t: targetTime,
    x: p1.x + t * (p2.x - p1.x),
    y: p1.y + t * (p2.y - p1.y),
    z: p1.z + t * (p2.z - p1.z),
  };
}

export function getBallPositionAtTime(
  trajectory: TrajectoryPoint[],
  targetTime: number,
): TrajectoryPoint | null {
  if (trajectory.length === 0) return null;
  if (trajectory.length === 1) return { ...trajectory[0] };

  if (targetTime <= trajectory[0].t) return { ...trajectory[0] };
  if (targetTime >= trajectory[trajectory.length - 1].t) {
    return { ...trajectory[trajectory.length - 1] };
  }

  for (let i = 0; i < trajectory.length - 1; i++) {
    if (targetTime >= trajectory[i].t && targetTime <= trajectory[i + 1].t) {
      return interpolateAtTime(trajectory[i], trajectory[i + 1], targetTime);
    }
  }

  return null;
}
