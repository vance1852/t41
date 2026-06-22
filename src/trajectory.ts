import { TrajectoryPoint, NetCrossing, LandingPoint } from "./types";
import {
  crossesNet,
  findLanding,
  getBallPositionAtTime,
  EPSILON,
  CourtConfig,
} from "./court";

export interface TrajectoryAnalysis {
  netCrossings: NetCrossing[];
  landings: LandingPoint[];
  highestPoint: { t: number; z: number };
  allPoints: TrajectoryPoint[];
}

export function analyzeSegment(
  p1: TrajectoryPoint,
  p2: TrajectoryPoint,
  court: CourtConfig,
): {
  netCrossing: NetCrossing | null;
  landing: LandingPoint | null;
} {
  const netCrossing = crossesNet(p1, p2, court);
  const landing = findLanding(p1, p2, court);

  return { netCrossing, landing };
}

export function analyzeTrajectory(
  trajectory: TrajectoryPoint[],
  court: CourtConfig,
): TrajectoryAnalysis {
  const sorted = [...trajectory].sort((a, b) => a.t - b.t);
  const netCrossings: NetCrossing[] = [];
  const landings: LandingPoint[] = [];
  let highestZ = -Infinity;
  let highestT = 0;

  for (const p of sorted) {
    if (p.z > highestZ) {
      highestZ = p.z;
      highestT = p.t;
    }
  }

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i];
    const p2 = sorted[i + 1];
    const analysis = analyzeSegment(p1, p2, court);
    if (analysis.netCrossing) {
      const last = netCrossings[netCrossings.length - 1];
      const isDuplicate =
        last && Math.abs(last.time - analysis.netCrossing.time) < 0.02;
      if (!isDuplicate) {
        netCrossings.push(analysis.netCrossing);
      }
    }
    if (analysis.landing) {
      landings.push(analysis.landing);
    }
  }

  return {
    netCrossings,
    landings,
    highestPoint: { t: highestT, z: highestZ },
    allPoints: sorted,
  };
}

export function getPositionAt(
  trajectory: TrajectoryPoint[],
  time: number,
): TrajectoryPoint | null {
  return getBallPositionAtTime(trajectory, time);
}

export function hasTouchedNetBetween(
  p1: TrajectoryPoint,
  p2: TrajectoryPoint,
  court: CourtConfig,
): boolean {
  const netX = court.length / 2;
  const tolerance = 0.1;

  if (
    (p1.x - netX) * (p2.x - netX) > 0 &&
    Math.abs(p1.x - netX) > tolerance &&
    Math.abs(p2.x - netX) > tolerance
  ) {
    return false;
  }

  if (Math.abs(p2.x - p1.x) < EPSILON) {
    return (
      Math.abs(p1.x - netX) <= tolerance + EPSILON &&
      Math.min(p1.z, p2.z) <= court.netHeight + EPSILON
    );
  }

  const t = (netX - p1.x) / (p2.x - p1.x);
  if (t < 0 || t > 1) return false;

  const crossZ = p1.z + t * (p2.z - p1.z);
  return crossZ <= court.netHeight + EPSILON;
}

export function trajectoryTouchesNet(
  trajectory: TrajectoryPoint[],
  court: CourtConfig,
): boolean {
  const sorted = [...trajectory].sort((a, b) => a.t - b.t);
  for (let i = 0; i < sorted.length - 1; i++) {
    if (hasTouchedNetBetween(sorted[i], sorted[i + 1], court)) {
      return true;
    }
  }
  return false;
}

export function findFirstLanding(
  trajectory: TrajectoryPoint[],
  court: CourtConfig,
): LandingPoint | null {
  const analysis = analyzeTrajectory(trajectory, court);
  if (analysis.landings.length === 0) return null;
  return analysis.landings.reduce((earliest, cur) =>
    cur.time < earliest.time ? cur : earliest,
  );
}

export function findFirstNetCrossing(
  trajectory: TrajectoryPoint[],
  court: CourtConfig,
): NetCrossing | null {
  const analysis = analyzeTrajectory(trajectory, court);
  if (analysis.netCrossings.length === 0) return null;
  return analysis.netCrossings.reduce((earliest, cur) =>
    cur.time < earliest.time ? cur : earliest,
  );
}
