import {
  crossesNet,
  findLanding,
  interpolateAtTime,
  getBallPositionAtTime,
  getDefaultCourt,
  CourtConfig,
} from "../src/court";
import {
  analyzeTrajectory,
  findFirstLanding,
  findFirstNetCrossing,
  hasTouchedNetBetween,
  trajectoryTouchesNet,
} from "../src/trajectory";
import { TrajectoryPoint } from "../src/types";

describe("trajectory - 轨迹插值与分析", () => {
  let court: CourtConfig;

  beforeEach(() => {
    court = getDefaultCourt();
  });

  describe("crossesNet - 过网判定", () => {
    it("球从A到B正常过网", () => {
      const p1: TrajectoryPoint = { t: 0, x: 5, y: 0, z: 3.0 };
      const p2: TrajectoryPoint = { t: 1, x: 13, y: 0, z: 3.0 };
      const r = crossesNet(p1, p2, court);
      expect(r).not.toBeNull();
      expect(r!.cleared).toBe(true);
      expect(r!.hitAntenna).toBe(false);
      expect(r!.x).toBe(9);
    });

    it("球过网高度低于网高不算过网(未过网)", () => {
      const p1: TrajectoryPoint = { t: 0, x: 5, y: 0, z: 2.0 };
      const p2: TrajectoryPoint = { t: 1, x: 13, y: 0, z: 2.0 };
      const r = crossesNet(p1, p2, court);
      expect(r).not.toBeNull();
      expect(r!.cleared).toBe(false);
    });

    it("球未穿过网平面返回null", () => {
      const p1: TrajectoryPoint = { t: 0, x: 5, y: 0, z: 3.0 };
      const p2: TrajectoryPoint = { t: 1, x: 7, y: 0, z: 3.0 };
      const r = crossesNet(p1, p2, court);
      expect(r).toBeNull();
    });

    it("球在标志杆位置过网算触杆", () => {
      const antennaY = court.width / 2 + 0.8;
      const p1: TrajectoryPoint = { t: 0, x: 5, y: antennaY, z: 3.0 };
      const p2: TrajectoryPoint = { t: 1, x: 13, y: antennaY, z: 3.0 };
      const r = crossesNet(p1, p2, court);
      expect(r).not.toBeNull();
      expect(r!.hitAntenna).toBe(true);
    });
  });

  describe("findLanding - 落点判定(插值)", () => {
    it("从z>0降到z<0正确插值落点", () => {
      const p1: TrajectoryPoint = { t: 0, x: 5, y: 0, z: 2.0 };
      const p2: TrajectoryPoint = { t: 1, x: 10, y: 0, z: -2.0 };
      const r = findLanding(p1, p2, court);
      expect(r).not.toBeNull();
      expect(r!.x).toBeCloseTo(7.5, 3);
      expect(r!.y).toBeCloseTo(0, 3);
      expect(r!.inBounds).toBe(true);
    });

    it("落点在x=0端线上(x=0压线算界内)", () => {
      const p1: TrajectoryPoint = { t: 0, x: 1, y: 0, z: 2.0 };
      const p2: TrajectoryPoint = { t: 1, x: -1, y: 0, z: -2.0 };
      const r = findLanding(p1, p2, court);
      expect(r).not.toBeNull();
      expect(r!.x).toBe(0);
      expect(r!.onLine).toBe(true);
      expect(r!.inBounds).toBe(true);
    });

    it("两个点都z>0没有落点", () => {
      const p1: TrajectoryPoint = { t: 0, x: 5, y: 0, z: 2.0 };
      const p2: TrajectoryPoint = { t: 1, x: 13, y: 0, z: 3.0 };
      const r = findLanding(p1, p2, court);
      expect(r).toBeNull();
    });

    it("落点正好在y=4.5边线上算压线界内", () => {
      const p1: TrajectoryPoint = { t: 0, x: 14, y: 4.5, z: 2.0 };
      const p2: TrajectoryPoint = { t: 1, x: 14, y: 4.5, z: -2.0 };
      const r = findLanding(p1, p2, court);
      expect(r).not.toBeNull();
      expect(r!.onLine).toBe(true);
      expect(r!.inBounds).toBe(true);
    });

    it("关键：采样点越过边线但插值落压线界内", () => {
      const p1: TrajectoryPoint = { t: 0, x: 3, y: 4.0, z: 1.5 };
      const p2: TrajectoryPoint = { t: 1, x: 3, y: 5.0, z: -1.5 };
      const r = findLanding(p1, p2, court);
      expect(r).not.toBeNull();
      expect(r!.y).toBeCloseTo(4.5, 3);
      expect(r!.onLine).toBe(true);
      expect(r!.inBounds).toBe(true);
    });
  });

  describe("interpolateAtTime - 时间插值", () => {
    it("线性插值中间时间点", () => {
      const p1: TrajectoryPoint = { t: 0, x: 0, y: 0, z: 0 };
      const p2: TrajectoryPoint = { t: 2, x: 10, y: 2, z: 4 };
      const r = interpolateAtTime(p1, p2, 1);
      expect(r.t).toBe(1);
      expect(r.x).toBe(5);
      expect(r.y).toBe(1);
      expect(r.z).toBe(2);
    });
  });

  describe("getBallPositionAtTime - 离散采样插值", () => {
    it("在多个采样点间正确插值", () => {
      const traj: TrajectoryPoint[] = [
        { t: 0, x: 0, y: 0, z: 3 },
        { t: 1, x: 5, y: 0, z: 2 },
        { t: 2, x: 15, y: 0, z: 0 },
      ];
      const r = getBallPositionAtTime(traj, 0.5);
      expect(r).not.toBeNull();
      expect(r!.x).toBeCloseTo(2.5, 3);
      const r2 = getBallPositionAtTime(traj, 1.5);
      expect(r2!.x).toBeCloseTo(10, 3);
    });

    it("时间早于最早采样点返回第一个点", () => {
      const traj: TrajectoryPoint[] = [
        { t: 1, x: 5, y: 0, z: 2 },
        { t: 2, x: 15, y: 0, z: 0 },
      ];
      const r = getBallPositionAtTime(traj, 0);
      expect(r!.t).toBe(1);
      expect(r!.x).toBe(5);
    });
  });

  describe("hasTouchedNetBetween - 擦网判定", () => {
    it("低球擦网顶部返回true(2.26到2.2插值在x=9时约2.23，低于2.24网高)", () => {
      const p1: TrajectoryPoint = { t: 0, x: 7, y: 0, z: 2.26 };
      const p2: TrajectoryPoint = { t: 1, x: 11, y: 0, z: 2.2 };
      expect(hasTouchedNetBetween(p1, p2, court)).toBe(true);
    });

    it("高球过网不擦网返回false", () => {
      const p1: TrajectoryPoint = { t: 0, x: 7, y: 0, z: 3.0 };
      const p2: TrajectoryPoint = { t: 1, x: 11, y: 0, z: 3.0 };
      expect(hasTouchedNetBetween(p1, p2, court)).toBe(false);
    });

    it("完全不过网平面返回false", () => {
      const p1: TrajectoryPoint = { t: 0, x: 5, y: 0, z: 1.0 };
      const p2: TrajectoryPoint = { t: 1, x: 6, y: 0, z: 0.5 };
      expect(hasTouchedNetBetween(p1, p2, court)).toBe(false);
    });
  });

  describe("analyzeTrajectory - 综合分析", () => {
    it("完整发球轨迹分析（过网1次，端点在网平面上不算重复）", () => {
      const traj: TrajectoryPoint[] = [
        { t: 0, x: 0.5, y: 0, z: 3 },
        { t: 0.5, x: 9, y: 0, z: 2.6 },
        { t: 1, x: 15, y: 0, z: 0 },
      ];
      const r = analyzeTrajectory(traj, court);
      expect(r.netCrossings.length).toBe(1);
      expect(r.netCrossings[0].cleared).toBe(true);
      expect(r.landings.length).toBe(1);
      expect(r.landings[0].teamSide).toBe("B");
      expect(r.landings[0].inBounds).toBe(true);
    });

    it("findFirstLanding找最早落点", () => {
      const traj: TrajectoryPoint[] = [
        { t: 0, x: 0.5, y: 0, z: 3 },
        { t: 1, x: 15, y: 0, z: 0 },
        { t: 1.1, x: 15.2, y: 0, z: -0.2 },
      ];
      const landing = findFirstLanding(traj, court);
      expect(landing).not.toBeNull();
      expect(landing!.time).toBe(1);
    });

    it("findFirstNetCrossing找最早过网", () => {
      const traj: TrajectoryPoint[] = [
        { t: 0, x: 0.5, y: 0, z: 3 },
        { t: 0.5, x: 9, y: 0, z: 2.6 },
        { t: 1, x: 15, y: 0, z: 1 },
        { t: 2, x: 9, y: 0, z: 2.5 },
      ];
      const crossing = findFirstNetCrossing(traj, court);
      expect(crossing).not.toBeNull();
      expect(crossing!.time).toBeLessThan(1);
    });

    it("trajectoryTouchesNet擦网检测", () => {
      const traj: TrajectoryPoint[] = [
        { t: 0, x: 7, y: 0, z: 2.26 },
        { t: 0.5, x: 9, y: 0, z: 2.24 },
        { t: 1, x: 11, y: 0, z: 2.2 },
      ];
      expect(trajectoryTouchesNet(traj, court)).toBe(true);
    });
  });
});
