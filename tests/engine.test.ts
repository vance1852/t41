import {
  processRally,
  processBatch,
  sortEventsByTime,
  checkConsecutiveTouches,
  checkFourTouches,
  createInitialState,
} from "../src/engine";
import { Rally, Team, RallyState, TouchRecord, EventType } from "../src/types";

function makeRally(
  id: string,
  servingTeam: Team,
  events: Rally["events"],
  opts: Partial<Rally> = {},
): Rally {
  return {
    id,
    name: id,
    servingTeam,
    courtLength: 18,
    courtWidth: 9,
    netHeight: 2.24,
    events,
    ...opts,
  };
}

describe("engine - 规则引擎", () => {
  describe("基础工具函数", () => {
    it("sortEventsByTime 正确排序", () => {
      const events = [
        { id: "e3", type: "landing" as EventType, t: 3.0 },
        {
          id: "e1",
          type: "serve" as EventType,
          t: 0.0,
          team: "A" as Team,
          player: 1,
        },
        {
          id: "e2",
          type: "receive" as EventType,
          t: 1.0,
          team: "B" as Team,
          player: 6,
        },
      ];
      const sorted = sortEventsByTime(events);
      expect(sorted[0].id).toBe("e1");
      expect(sorted[1].id).toBe("e2");
      expect(sorted[2].id).toBe("e3");
    });

    it("createInitialState 初始化正确", () => {
      const s = createInitialState("A");
      expect(s.ballSide).toBe("A");
      expect(s.touchesByTeam.A).toBe(0);
      expect(s.touchesByTeam.B).toBe(0);
      expect(s.ended).toBe(false);
    });

    it("checkConsecutiveTouches 连续触球检测", () => {
      const s = createInitialState("A");
      s.lastTouchByPlayer.A = 6;
      expect(checkConsecutiveTouches(s, "A", 6, false)).toBe(true);
      expect(checkConsecutiveTouches(s, "A", 6, true)).toBe(false);
      expect(checkConsecutiveTouches(s, "A", 7, false)).toBe(false);
    });

    it("checkFourTouches 四次击球检测", () => {
      const s = createInitialState("A");
      s.touchesByTeam.A = 3;
      expect(checkFourTouches(s, "A", false)).toBe(true);
      expect(checkFourTouches(s, "A", true)).toBe(false);
      s.touchesByTeam.A = 2;
      expect(checkFourTouches(s, "A", false)).toBe(false);
    });
  });

  describe("得分方规则", () => {
    it("球落在某队场区界内，对方得分：A发球落B方，A得分", () => {
      const rally = makeRally("serve-ace", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.0, x: 15, y: 0, z: 0 },
          ],
        },
        { id: "e2", type: "landing", t: 1.0 },
      ]);
      const r = processRally(rally);
      expect(r.winner).toBe("A");
      expect(r.reason).toContain("界内");
      expect(r.state.touchesByTeam.A).toBe(1);
    });

    it("球落在某队场区界内，对方得分：B扣球落A方，B得分", () => {
      const rally = makeRally("spike-land-a", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.1, x: 14, y: 0, z: 2 },
          ],
        },
        {
          id: "e2",
          type: "receive",
          t: 1.1,
          team: "B",
          player: 6,
          trajectory: [
            { t: 1.1, x: 14, y: 0, z: 2 },
            { t: 1.3, x: 12, y: 0, z: 3.5 },
          ],
        },
        {
          id: "e3",
          type: "set",
          t: 1.3,
          team: "B",
          player: 2,
          trajectory: [
            { t: 1.3, x: 12, y: 0, z: 3.5 },
            { t: 1.6, x: 10.5, y: 0, z: 3.2 },
          ],
        },
        {
          id: "e4",
          type: "spike",
          t: 1.6,
          team: "B",
          player: 4,
          trajectory: [
            { t: 1.6, x: 10.5, y: 0, z: 3 },
            { t: 1.8, x: 9, y: 0, z: 2.7 },
            { t: 2.1, x: 5, y: 0, z: 0 },
          ],
        },
        { id: "e5", type: "landing", t: 2.1 },
      ]);
      const r = processRally(rally);
      expect(r.state.touchesByTeam.B).toBe(3);
      expect(r.winner).toBe("B");
      expect(r.reason).toContain("界内");
    });

    it("最后触球队把球打出界，对方得分：A发球出界，B得分", () => {
      const rally = makeRally("serve-out", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 3, z: 3 },
            { t: 0.6, x: 9, y: 5, z: 2.6 },
            { t: 1.0, x: 15, y: 6, z: 0 },
          ],
        },
        { id: "e2", type: "landing", t: 1.0 },
      ]);
      const r = processRally(rally);
      expect(r.winner).toBe("B");
      expect(r.reason).toContain("出界");
    });
  });

  describe("触球次数限制", () => {
    it("A队第4次触球判四次击球犯规，对方(B)得分", () => {
      const rally = makeRally("4touches", "B", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "B",
          player: 7,
          trajectory: [
            { t: 0, x: 17.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.1, x: 4, y: 0, z: 2 },
          ],
        },
        {
          id: "e2",
          type: "receive",
          t: 1.1,
          team: "A",
          player: 6,
          trajectory: [
            { t: 1.1, x: 4, y: 0, z: 2 },
            { t: 1.3, x: 5, y: 0, z: 3 },
          ],
        },
        {
          id: "e3",
          type: "set",
          t: 1.3,
          team: "A",
          player: 2,
          trajectory: [
            { t: 1.3, x: 5, y: 0, z: 3 },
            { t: 1.5, x: 6, y: 0, z: 3.2 },
          ],
        },
        {
          id: "e4",
          type: "receive",
          t: 1.5,
          team: "A",
          player: 4,
          trajectory: [
            { t: 1.5, x: 6, y: 0, z: 3.2 },
            { t: 1.7, x: 7, y: 0, z: 3 },
          ],
        },
        { id: "e5", type: "spike", t: 1.7, team: "A", player: 3 },
      ]);
      const r = processRally(rally);
      const violations = r.violations.filter((v) => v.type === "four_touches");
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].team).toBe("A");
      expect(r.winner).toBe("B");
    });
  });

  describe("拦网特例", () => {
    it("拦网触球不计入三次，拦网后还可以三次触球", () => {
      const rally = makeRally("block-special", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.1, x: 14, y: 0, z: 2 },
          ],
        },
        {
          id: "e2",
          type: "receive",
          t: 1.1,
          team: "B",
          player: 6,
          trajectory: [
            { t: 1.1, x: 14, y: 0, z: 2 },
            { t: 1.3, x: 12, y: 0, z: 3.5 },
          ],
        },
        {
          id: "e3",
          type: "set",
          t: 1.3,
          team: "B",
          player: 2,
          trajectory: [
            { t: 1.3, x: 12, y: 0, z: 3.5 },
            { t: 1.7, x: 10.5, y: 0, z: 3.2 },
          ],
        },
        {
          id: "e4",
          type: "spike",
          t: 1.7,
          team: "B",
          player: 4,
          trajectory: [
            { t: 1.7, x: 10.5, y: 0, z: 3 },
            { t: 1.85, x: 9, y: 0, z: 2.85 },
            { t: 2.0, x: 9, y: 0, z: 2.9 },
          ],
        },
        {
          id: "e5",
          type: "block",
          t: 1.85,
          team: "A",
          player: 3,
          trajectory: [
            { t: 1.85, x: 9, y: 0, z: 2.85 },
            { t: 2.0, x: 11, y: 0, z: 3 },
          ],
        },
        {
          id: "e6",
          type: "receive",
          t: 2.0,
          team: "B",
          player: 5,
          trajectory: [
            { t: 2.0, x: 11, y: 0, z: 3 },
            { t: 2.3, x: 13, y: 0, z: 3.5 },
          ],
        },
        {
          id: "e7",
          type: "spike",
          t: 2.3,
          team: "B",
          player: 4,
          trajectory: [
            { t: 2.3, x: 13, y: 0, z: 3.5 },
            { t: 2.5, x: 9, y: 0, z: 3.2 },
            { t: 2.8, x: 3, y: 0, z: 0 },
          ],
        },
        { id: "e8", type: "landing", t: 2.8 },
      ]);
      const r = processRally(rally);
      const blockTouches = r.state.touchHistory.filter((t) => t.isBlock);
      expect(blockTouches.length).toBe(1);
      expect(r.state.touchesByTeam.B).toBe(2);
      const fourTouches = r.violations.filter((v) => v.type === "four_touches");
      expect(fourTouches.length).toBe(0);
      expect(r.winner).toBe("B");
    });
  });

  describe("连续触球", () => {
    it("同一球员连续触球犯规，对方得分", () => {
      const rally = makeRally("consecutive", "B", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "B",
          player: 7,
          trajectory: [
            { t: 0, x: 17.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.1, x: 4, y: 0, z: 2 },
          ],
        },
        {
          id: "e2",
          type: "receive",
          t: 1.1,
          team: "A",
          player: 6,
          trajectory: [
            { t: 1.1, x: 4, y: 0, z: 2 },
            { t: 1.25, x: 4.2, y: 0, z: 2.5 },
          ],
        },
        { id: "e3", type: "set", t: 1.25, team: "A", player: 6 },
      ]);
      const r = processRally(rally);
      const cons = r.violations.filter((v) => v.type === "consecutive_touches");
      expect(cons.length).toBeGreaterThan(0);
      expect(cons[0].team).toBe("A");
      expect(r.winner).toBe("B");
    });
  });

  describe("压线球", () => {
    it("球落在y=4.5边线上算界内，对方得分", () => {
      const rally = makeRally("line-ball", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 4, z: 3 },
            { t: 0.6, x: 9, y: 4.49, z: 2.6 },
            { t: 1.0, x: 14, y: 4.5, z: 0 },
          ],
        },
        { id: "e2", type: "landing", t: 1.0 },
      ]);
      const r = processRally(rally);
      const landing = r.state.landings[0];
      expect(landing).toBeDefined();
      expect(landing!.onLine).toBe(true);
      expect(landing!.inBounds).toBe(true);
      expect(r.winner).toBe("A");
    });
  });

  describe("插值落点 - 不要只看最后一个采样点", () => {
    it("采样点y越过边线但插值落点正好压线(界内)", () => {
      const rally = makeRally("interp-line", "B", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "B",
          player: 5,
          trajectory: [
            { t: 0, x: 17.5, y: 3, z: 3 },
            { t: 0.8, x: 9, y: 5, z: 2.6 },
            { t: 1.1, x: 5, y: 5, z: 1.5 },
            { t: 1.3, x: 3, y: 4.4, z: 0 },
            { t: 1.4, x: 2.5, y: 5, z: -0.3 },
          ],
        },
        { id: "e2", type: "landing", t: 1.35 },
      ]);
      const r = processRally(rally);
      const landing = r.state.landings[0];
      expect(landing).toBeDefined();
      expect(landing!.y).toBeLessThanOrEqual(4.5 + 0.001);
      expect(landing!.inBounds || landing!.onLine).toBe(true);
    });
  });

  describe("事件乱序", () => {
    it("乱序事件按时间排序处理，B扣球落A方B得分", () => {
      const rally = makeRally("out-of-order", "A", [
        {
          id: "e3",
          type: "set",
          t: 1.3,
          team: "B",
          player: 2,
          trajectory: [
            { t: 1.3, x: 12, y: 0, z: 3.5 },
            { t: 1.6, x: 10.5, y: 0, z: 3.2 },
          ],
        },
        {
          id: "e5",
          type: "landing",
          t: 2.1,
        },
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.1, x: 14, y: 0, z: 2 },
          ],
        },
        {
          id: "e4",
          type: "spike",
          t: 1.6,
          team: "B",
          player: 4,
          trajectory: [
            { t: 1.6, x: 10.5, y: 0, z: 3 },
            { t: 1.85, x: 9, y: 0, z: 2.7 },
            { t: 2.1, x: 5, y: 0, z: 0 },
          ],
        },
        {
          id: "e2",
          type: "receive",
          t: 1.1,
          team: "B",
          player: 6,
          trajectory: [
            { t: 1.1, x: 14, y: 0, z: 2 },
            { t: 1.3, x: 12, y: 0, z: 3.5 },
          ],
        },
      ]);
      const r = processRally(rally);
      const firstExp = r.explanation[0];
      expect(firstExp.eventType).toBe("serve");
      expect(r.winner).toBe("B");
    });
  });

  describe("触网犯规", () => {
    it("球员触网对方得分", () => {
      const rally = makeRally("touch-net", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.1, x: 14, y: 0, z: 2 },
          ],
        },
        { id: "e2", type: "receive", t: 1.1, team: "B", player: 6 },
        { id: "e3", type: "touch_net", t: 1.15, team: "B", player: 6 },
      ]);
      const r = processRally(rally);
      const vn = r.violations.filter((v) => v.type === "touch_net");
      expect(vn.length).toBeGreaterThan(0);
      expect(vn[0].team).toBe("B");
      expect(r.winner).toBe("A");
    });
  });

  describe("挑战复核", () => {
    it("落点判定后挑战成功，推翻原判罚，得分方反转", () => {
      const rally = makeRally("challenge-landing", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 3, z: 3 },
            { t: 0.6, x: 9, y: 5, z: 2.6 },
            { t: 1.0, x: 15, y: 6, z: 0 },
          ],
        },
        { id: "e2", type: "landing", t: 1.0 },
        {
          id: "e3",
          type: "challenge_review",
          t: 1.5,
          challenge_overturned: true,
          note: "鹰眼显示球压线",
        },
      ]);
      const r = processRally(rally);
      expect(r.explanation.length).toBeGreaterThanOrEqual(3);
      const challengeExp = r.explanation[r.explanation.length - 1];
      expect(challengeExp.eventType).toBe("challenge_review");
      expect(challengeExp.outcome).toContain("挑战成功");
      expect(r.winner).toBe("A");
      expect(r.reason).toContain("挑战推翻原判");
    });

    it("犯规判定后挑战成功，推翻犯规判罚，得分方反转", () => {
      const rally = makeRally("challenge-foul", "B", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "B",
          player: 7,
          trajectory: [
            { t: 0, x: 17.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.1, x: 4, y: 0, z: 2 },
          ],
        },
        {
          id: "e2",
          type: "receive",
          t: 1.1,
          team: "A",
          player: 6,
          trajectory: [
            { t: 1.1, x: 4, y: 0, z: 2 },
            { t: 1.25, x: 4.2, y: 0, z: 2.5 },
          ],
        },
        { id: "e3", type: "set", t: 1.25, team: "A", player: 6 },
        {
          id: "e4",
          type: "challenge_review",
          t: 1.3,
          challenge_overturned: true,
          note: "录像显示6号并非连续触球",
        },
      ]);
      const r = processRally(rally);
      const challengeExp = r.explanation.find(
        (e) => e.eventType === "challenge_review",
      );
      expect(challengeExp).toBeDefined();
      expect(challengeExp!.outcome).toContain("挑战成功");
      expect(r.state.violations.length).toBe(0);
      expect(r.winner).toBe("A");
      expect(r.reason).toContain("挑战推翻原判");
    });

    it("挑战失败，维持原判", () => {
      const rally = makeRally("challenge-fail", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 3, z: 3 },
            { t: 0.6, x: 9, y: 5, z: 2.6 },
            { t: 1.0, x: 15, y: 6, z: 0 },
          ],
        },
        { id: "e2", type: "landing", t: 1.0 },
        {
          id: "e3",
          type: "challenge_review",
          t: 1.5,
          challenge_overturned: false,
          note: "维持出界判罚",
        },
      ]);
      const r = processRally(rally);
      const challengeExp = r.explanation.find(
        (e) => e.eventType === "challenge_review",
      );
      expect(challengeExp).toBeDefined();
      expect(challengeExp!.outcome).toContain("挑战失败");
      expect(r.winner).toBe("B");
    });
  });

  describe("批量判定与比分累计", () => {
    it("5个回合累计比分正确", () => {
      const rallies: Rally[] = [
        makeRally("r1", "A", [
          {
            id: "r1-e1",
            type: "serve",
            t: 0,
            team: "A",
            player: 1,
            trajectory: [
              { t: 0, x: 0.5, y: 0, z: 3 },
              { t: 0.6, x: 9, y: 0, z: 2.6 },
              { t: 1.0, x: 15, y: 0, z: 0 },
            ],
          },
          { id: "r1-e2", type: "landing", t: 1.0 },
        ]),
        makeRally("r2", "B", [
          {
            id: "r2-e1",
            type: "serve",
            t: 0,
            team: "B",
            player: 7,
            trajectory: [
              { t: 0, x: 17.5, y: 0, z: 3 },
              { t: 0.6, x: 9, y: 0, z: 2.6 },
              { t: 1.1, x: 4, y: 0, z: 2 },
            ],
          },
          {
            id: "r2-e2",
            type: "receive",
            t: 1.1,
            team: "A",
            player: 6,
            trajectory: [
              { t: 1.1, x: 4, y: 0, z: 2 },
              { t: 1.25, x: 4.2, y: 0, z: 2.5 },
            ],
          },
          { id: "r2-e3", type: "set", t: 1.25, team: "A", player: 6 },
        ]),
        makeRally("r3", "A", [
          {
            id: "r3-e1",
            type: "serve",
            t: 0,
            team: "A",
            player: 1,
            trajectory: [
              { t: 0, x: 0.5, y: 4.4, z: 3 },
              { t: 0.6, x: 9, y: 4.49, z: 2.6 },
              { t: 1.1, x: 14, y: 4.5, z: 0 },
            ],
          },
          { id: "r3-e2", type: "landing", t: 1.1 },
        ]),
        makeRally("r4", "B", [
          {
            id: "r4-e1",
            type: "serve",
            t: 0,
            team: "B",
            player: 7,
            trajectory: [
              { t: 0, x: 17.5, y: 0, z: 3 },
              { t: 0.6, x: 9, y: 0, z: 2.6 },
              { t: 1.1, x: 4, y: 0, z: 2 },
            ],
          },
          {
            id: "r4-e2",
            type: "receive",
            t: 1.1,
            team: "A",
            player: 6,
            trajectory: [
              { t: 1.1, x: 4, y: 0, z: 2 },
              { t: 1.3, x: 5, y: 0, z: 3 },
            ],
          },
          {
            id: "r4-e3",
            type: "set",
            t: 1.3,
            team: "A",
            player: 2,
            trajectory: [
              { t: 1.3, x: 5, y: 0, z: 3 },
              { t: 1.5, x: 6, y: 0, z: 3.2 },
            ],
          },
          {
            id: "r4-e4",
            type: "receive",
            t: 1.5,
            team: "A",
            player: 4,
            trajectory: [
              { t: 1.5, x: 6, y: 0, z: 3.2 },
              { t: 1.7, x: 7, y: 0, z: 3 },
            ],
          },
          { id: "r4-e5", type: "spike", t: 1.7, team: "A", player: 3 },
        ]),
        makeRally("r5", "A", [
          {
            id: "r5-e1",
            type: "serve",
            t: 0,
            team: "A",
            player: 1,
            trajectory: [
              { t: 0, x: 0.5, y: 3, z: 3 },
              { t: 0.5, x: 9, y: 4.8, z: 2.6 },
              { t: 0.9, x: 14, y: 5.5, z: 0 },
            ],
          },
          { id: "r5-e2", type: "landing", t: 0.9 },
        ]),
      ];

      const batch = processBatch(rallies, { A: 0, B: 0 });
      expect(batch.summary.totalRallies).toBe(5);
      expect(batch.matchScore.teamA + batch.matchScore.teamB).toBe(5);
      expect(batch.rallies.length).toBe(5);
      expect(batch.rallies[0].winner).toBe("A");
      expect(batch.rallies[1].winner).toBe("B");
      expect(batch.rallies[2].winner).toBe("A");
      expect(batch.rallies[3].winner).toBe("B");
      expect(batch.rallies[4].winner).toBe("B");
      expect(batch.matchScore.teamA).toBe(2);
      expect(batch.matchScore.teamB).toBe(3);
      const lastR =
        batch.matchScore.rallyResults[batch.matchScore.rallyResults.length - 1];
      expect(lastR.scoreAfter).toEqual({ A: 2, B: 3 });
    });

    it("带初始比分的批量判定", () => {
      const rallies: Rally[] = [
        makeRally("r1", "A", [
          {
            id: "e1",
            type: "serve",
            t: 0,
            team: "A",
            player: 1,
            trajectory: [
              { t: 0, x: 0.5, y: 0, z: 3 },
              { t: 0.6, x: 9, y: 0, z: 2.6 },
              { t: 1.0, x: 15, y: 0, z: 0 },
            ],
          },
          { id: "e2", type: "landing", t: 1.0 },
        ]),
      ];
      const batch = processBatch(rallies, { A: 5, B: 3 });
      expect(batch.matchScore.teamA).toBe(6);
      expect(batch.matchScore.teamB).toBe(3);
    });
  });

  describe("裁判解释", () => {
    it("解释步骤完整有规则引用", () => {
      const rally = makeRally("exp-1", "A", [
        {
          id: "e1",
          type: "serve",
          t: 0,
          team: "A",
          player: 1,
          trajectory: [
            { t: 0, x: 0.5, y: 0, z: 3 },
            { t: 0.6, x: 9, y: 0, z: 2.6 },
            { t: 1.0, x: 15, y: 0, z: 0 },
          ],
        },
        { id: "e2", type: "landing", t: 1.0 },
      ]);
      const r = processRally(rally);
      expect(r.explanation.length).toBeGreaterThan(0);
      for (const exp of r.explanation) {
        expect(exp.step).toBeGreaterThan(0);
        expect(exp.ruleReference).toBeDefined();
        expect(exp.outcome).toBeDefined();
      }
    });
  });
});
