import {
  isInBounds,
  getSideOfPoint,
  hitsAntenna,
  isOutsideAntenna,
  isOnSideline,
  isOnEndLine,
  getDefaultCourt,
  STANDARD_COURT_LENGTH,
  STANDARD_COURT_WIDTH,
  LINE_WIDTH,
  CourtConfig,
} from "../src/court";

describe("court - 场地几何判定", () => {
  let court: CourtConfig;

  beforeEach(() => {
    court = getDefaultCourt();
  });

  it("标准场地尺寸", () => {
    expect(court.length).toBe(STANDARD_COURT_LENGTH);
    expect(court.width).toBe(STANDARD_COURT_WIDTH);
  });

  describe("isInBounds - 界内判定", () => {
    it("场地中心点是界内，中线不算边界压线", () => {
      const r = isInBounds(9, 0, court);
      expect(r.inBounds).toBe(true);
      expect(r.onLine).toBe(false);
    });

    it("A队场地内部点是界内", () => {
      const r = isInBounds(3, 2, court);
      expect(r.inBounds).toBe(true);
      expect(r.onLine).toBe(false);
    });

    it("B队场地内部点是界内", () => {
      const r = isInBounds(15, -2, court);
      expect(r.inBounds).toBe(true);
      expect(r.onLine).toBe(false);
    });

    it("x远小于0是界外", () => {
      const r = isInBounds(-1, 0, court);
      expect(r.inBounds).toBe(false);
    });

    it("x远大于18是界外", () => {
      const r = isInBounds(19, 0, court);
      expect(r.inBounds).toBe(false);
    });

    it("y远大于4.5是界外", () => {
      const r = isInBounds(9, 5, court);
      expect(r.inBounds).toBe(false);
    });

    it("y远小于-4.5是界外", () => {
      const r = isInBounds(9, -5, court);
      expect(r.inBounds).toBe(false);
    });
  });

  describe("压线判定", () => {
    it("落在A队端线(x=0)附近算压线界内", () => {
      const tolerance = LINE_WIDTH / 2;
      const r = isInBounds(0 + tolerance * 0.5, 0, court);
      expect(r.inBounds).toBe(true);
      expect(r.onLine).toBe(true);
    });

    it("落在B队端线(x=18)算压线界内", () => {
      const r = isInBounds(18, 0, court);
      expect(r.inBounds).toBe(true);
      expect(r.onLine).toBe(true);
    });

    it("落在正边线y=4.5算压线界内", () => {
      const r = isInBounds(9, 4.5, court);
      expect(r.inBounds).toBe(true);
      expect(r.onLine).toBe(true);
    });

    it("落在负边线y=-4.5算压线界内", () => {
      const r = isInBounds(9, -4.5, court);
      expect(r.inBounds).toBe(true);
      expect(r.onLine).toBe(true);
    });

    it("落在边线外一点点(+0.02)仍算压线界内(5cm宽线)", () => {
      const r = isInBounds(9, 4.5 + 0.02, court);
      expect(r.inBounds).toBe(true);
      expect(r.onLine).toBe(true);
    });

    it("中线(x=9)附近落点是界内但不算边界压线", () => {
      const r = isInBounds(9, 0, court);
      expect(r.onLine).toBe(false);
      expect(r.inBounds).toBe(true);
    });
  });

  describe("isOnSideline / isOnEndLine", () => {
    it("y=4.5在边线上", () => {
      expect(isOnSideline(4.5, court)).toBe(true);
    });

    it("y=-4.5在边线上", () => {
      expect(isOnSideline(-4.5, court)).toBe(true);
    });

    it("y=0不在边线上", () => {
      expect(isOnSideline(0, court)).toBe(false);
    });

    it("x=0在端线上", () => {
      expect(isOnEndLine(0, court)).toBe(true);
    });

    it("x=18在端线上", () => {
      expect(isOnEndLine(18, court)).toBe(true);
    });
  });

  describe("getSideOfPoint - 场地归属", () => {
    it("x=3属于A队", () => {
      expect(getSideOfPoint(3)).toBe("A");
    });

    it("x=15属于B队", () => {
      expect(getSideOfPoint(15)).toBe("B");
    });

    it("x<9归A队，x>9归B队", () => {
      expect(getSideOfPoint(8.99)).toBe("A");
      expect(getSideOfPoint(9.01)).toBe("B");
    });
  });

  describe("标志杆判定", () => {
    it("标志杆位置附近(网高平面)算触杆", () => {
      const antennaY = court.width / 2 + 0.8;
      const r = hitsAntenna(9, antennaY, court);
      expect(r).toBe(true);
    });

    it("距离标志杆0.05m内算触杆", () => {
      const antennaY = court.width / 2 + 0.8;
      const r = hitsAntenna(9, antennaY + 0.05, court);
      expect(r).toBe(true);
    });

    it("不在网平面不会触标志杆", () => {
      const antennaY = court.width / 2 + 0.8;
      const r = hitsAntenna(8, antennaY, court);
      expect(r).toBe(false);
    });

    it("y在标志杆外侧算outside antenna", () => {
      const antennaY = court.width / 2 + 0.8;
      expect(isOutsideAntenna(antennaY + 0.1, court)).toBe(true);
      expect(isOutsideAntenna(0, court)).toBe(false);
    });
  });
});
