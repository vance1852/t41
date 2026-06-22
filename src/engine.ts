import {
  Rally,
  RallyEvent,
  RallyState,
  RallyResult,
  Violation,
  Team,
  EventType,
  TouchRecord,
  JudgeExplanation,
  MatchScore,
  BatchResult,
} from "./types";
import {
  getDefaultCourt,
  getSideOfPoint,
  isInBounds,
  hitsAntenna,
  isOutsideAntenna,
  CourtConfig,
} from "./court";
import {
  analyzeTrajectory,
  findFirstLanding,
  findFirstNetCrossing,
  trajectoryTouchesNet,
  getPositionAt,
} from "./trajectory";

const MAX_TOUCHES_PER_TEAM = 3;

export interface EngineOptions {
  court?: Partial<CourtConfig>;
  debug?: boolean;
}

export function createInitialState(servingTeam: Team): RallyState {
  return {
    currentTeamSide: servingTeam,
    touchesByTeam: { A: 0, B: 0 },
    lastTouchByPlayer: { A: null, B: null },
    lastTouchTeam: null,
    touchHistory: [],
    netCrossings: [],
    landings: [],
    violations: [],
    ballSide: servingTeam,
    ended: false,
    endTime: null,
    challengeOverturned: false,
  };
}

export function sortEventsByTime(events: RallyEvent[]): RallyEvent[] {
  return [...events].sort((a, b) => a.t - b.t);
}

export function isTouchEventType(type: EventType): boolean {
  return ["serve", "receive", "set", "spike", "block"].includes(type);
}

export function getCourtFromRally(rally: Rally): CourtConfig {
  return {
    length: rally.courtLength,
    width: rally.courtWidth,
    netHeight: rally.netHeight,
  };
}

function opponent(team: Team): Team {
  return team === "A" ? "B" : "A";
}

export function checkConsecutiveTouches(
  state: RallyState,
  team: Team,
  player: number,
  isBlock: boolean,
): boolean {
  if (isBlock) return false;
  return state.lastTouchByPlayer[team] === player;
}

export function checkFourTouches(
  state: RallyState,
  team: Team,
  isBlock: boolean,
): boolean {
  if (isBlock) return false;
  return state.touchesByTeam[team] >= MAX_TOUCHES_PER_TEAM;
}

function addTouch(state: RallyState, record: TouchRecord): void {
  state.touchHistory.push(record);
  state.lastTouchTeam = record.team;
  if (!record.isBlock) {
    state.touchesByTeam[record.team] += 1;
    state.lastTouchByPlayer[record.team] = record.player;
  } else {
    state.lastTouchByPlayer[record.team] = null;
  }
}

function resetTouchesForTeam(state: RallyState, team: Team): void {
  state.touchesByTeam[team] = 0;
  state.lastTouchByPlayer[team] = null;
}

function addViolation(state: RallyState, violation: Violation): void {
  state.violations.push(violation);
  state.ended = true;
  state.endTime = violation.time;
}

function eventToAction(type: EventType, team?: Team, player?: number): string {
  const teamStr = team ? `队${team}` : "";
  const playerStr = player !== undefined ? `${player}号` : "";
  const map: Record<EventType, string> = {
    serve: `${teamStr}${playerStr}发球`,
    receive: `${teamStr}${playerStr}接发`,
    set: `${teamStr}${playerStr}二传`,
    spike: `${teamStr}${playerStr}扣球`,
    block: `${teamStr}${playerStr}拦网`,
    touch_net: `${teamStr}${playerStr}触网`,
    landing: "球落地",
    challenge_review: "挑战复核",
  };
  return map[type];
}

function ruleForEventType(type: EventType): string {
  const map: Record<EventType, string> = {
    serve: "排球规则 12 - 发球",
    receive: "排球规则 13 - 比赛中的击球",
    set: "排球规则 13 - 比赛中的击球",
    spike: "排球规则 13 - 比赛中的击球",
    block: "排球规则 14 - 拦网",
    touch_net: "排球规则 11 - 触网犯规",
    landing: "排球规则 8 - 得分",
    challenge_review: "排球规则 20 - 鹰眼挑战",
  };
  return map[type];
}

export function processRally(
  rally: Rally,
  options: EngineOptions = {},
): RallyResult {
  const court = {
    ...getDefaultCourt(),
    ...options.court,
    ...getCourtFromRally(rally),
  };
  const state = createInitialState(rally.servingTeam);
  const explanations: JudgeExplanation[] = [];
  let step = 0;

  const allTrajectory = rally.trajectory ? [...rally.trajectory] : [];
  for (const ev of rally.events) {
    if (ev.trajectory && ev.trajectory.length > 0) {
      for (const tp of ev.trajectory) {
        allTrajectory.push(tp);
      }
    }
  }

  const sortedEvents = sortEventsByTime(rally.events);
  const trajectoryAnalysis = analyzeTrajectory(allTrajectory, court);
  state.netCrossings = [...trajectoryAnalysis.netCrossings];
  state.landings = [...trajectoryAnalysis.landings];

  let eventTrajectory: typeof allTrajectory = rally.trajectory
    ? [...rally.trajectory]
    : [];

  for (const event of sortedEvents) {
    if (state.ended && event.type !== "challenge_review") break;

    if (event.trajectory) {
      for (const tp of event.trajectory) {
        eventTrajectory.push(tp);
      }
    }

    step++;
    const isBlock = event.type === "block";
    const team = event.team;
    const player = event.player;

    switch (event.type) {
      case "serve": {
        if (!team || player === undefined) break;
        state.ballSide = team;
        addTouch(state, {
          team,
          player,
          time: event.t,
          eventType: "serve",
          eventId: event.id,
          isBlock: false,
        });
        explanations.push({
          step,
          time: event.t,
          eventType: event.type,
          team,
          player,
          eventId: event.id,
          action: eventToAction(event.type, team, player),
          ruleReference: ruleForEventType(event.type),
          outcome: `${team}队发球，第1次触球`,
        });
        break;
      }

      case "receive":
      case "set":
      case "spike": {
        if (!team || player === undefined) break;

        if (state.lastTouchTeam !== null && state.lastTouchTeam !== team) {
          resetTouchesForTeam(state, team);
        }
        state.ballSide = team;

        if (checkConsecutiveTouches(state, team, player, false)) {
          const violation: Violation = {
            type: "consecutive_touches",
            team,
            description: `${team}队${player}号连续两次触球犯规`,
            time: event.t,
            eventId: event.id,
          };
          addViolation(state, violation);
          explanations.push({
            step,
            time: event.t,
            eventType: event.type,
            team,
            player,
            eventId: event.id,
            action: eventToAction(event.type, team, player),
            ruleReference: "排球规则 13.3.2 - 连续击球",
            outcome: `犯规：${team}队${player}号连续触球，${opponent(team)}队得分`,
          });
          break;
        }

        if (checkFourTouches(state, team, false)) {
          const violation: Violation = {
            type: "four_touches",
            team,
            description: `${team}队四次击球犯规（已触球${state.touchesByTeam[team]}次）`,
            time: event.t,
            eventId: event.id,
          };
          addViolation(state, violation);
          explanations.push({
            step,
            time: event.t,
            eventType: event.type,
            team,
            player,
            eventId: event.id,
            action: eventToAction(event.type, team, player),
            ruleReference: "排球规则 13.2.1 - 四次击球",
            outcome: `犯规：${team}队四次击球（已${state.touchesByTeam[team]}次），${opponent(team)}队得分`,
          });
          break;
        }

        const touchCount = state.touchesByTeam[team] + 1;
        addTouch(state, {
          team,
          player,
          time: event.t,
          eventType: event.type,
          eventId: event.id,
          isBlock: false,
        });

        let outcome = `${team}队第${touchCount}次触球`;
        if (event.type === "spike") {
          outcome += `，扣球进攻`;
        } else if (event.type === "set") {
          outcome += `，组织进攻`;
        } else if (event.type === "receive") {
          outcome += `，接发球到位`;
        }

        explanations.push({
          step,
          time: event.t,
          eventType: event.type,
          team,
          player,
          eventId: event.id,
          action: eventToAction(event.type, team, player),
          ruleReference: ruleForEventType(event.type),
          outcome,
        });
        break;
      }

      case "block": {
        if (!team || player === undefined) break;
        state.ballSide = team;

        addTouch(state, {
          team,
          player,
          time: event.t,
          eventType: "block",
          eventId: event.id,
          isBlock: true,
        });
        explanations.push({
          step,
          time: event.t,
          eventType: event.type,
          team,
          player,
          eventId: event.id,
          action: eventToAction(event.type, team, player),
          ruleReference: ruleForEventType(event.type),
          outcome: `${team}队${player}号拦网触球（拦网不计入三次触球），可继续组织进攻`,
        });
        break;
      }

      case "touch_net": {
        if (!team) break;
        const violation: Violation = {
          type: "touch_net",
          team,
          description: `${team}队${player !== undefined ? player + "号" : ""}触网犯规`,
          time: event.t,
          eventId: event.id,
        };
        addViolation(state, violation);
        explanations.push({
          step,
          time: event.t,
          eventType: event.type,
          team,
          player,
          eventId: event.id,
          action: eventToAction(event.type, team, player),
          ruleReference: ruleForEventType(event.type),
          outcome: `犯规：${team}队触网，${opponent(team)}队得分`,
        });
        break;
      }

      case "landing": {
        const landing = findFirstLanding(
          eventTrajectory.length > 0 ? eventTrajectory : allTrajectory,
          court,
        );

        if (landing) {
          const lastTouch = state.touchHistory[state.touchHistory.length - 1];
          const lastTouchTeamVal = lastTouch
            ? lastTouch.team
            : rally.servingTeam;
          const landingTeam = landing.teamSide;

          let winner: Team;
          let outcome: string;
          const other = opponent(lastTouchTeamVal);

          if (landing.inBounds || landing.onLine) {
            winner = opponent(landingTeam);
            if (landing.onLine && !landing.inBounds) {
              outcome = `球压线落在${landingTeam}方场地边界，坐标(${landing.x.toFixed(2)}, ${landing.y.toFixed(2)})，按规则压线算界内，${winner}队得分`;
            } else {
              outcome = `球落在${landingTeam}方场地界内${landing.onLine ? "（压线）" : ""}，坐标(${landing.x.toFixed(2)}, ${landing.y.toFixed(2)})，${winner}队得分`;
            }
          } else {
            winner = opponent(lastTouchTeamVal);
            outcome = `球落在界外，坐标(${landing.x.toFixed(2)}, ${landing.y.toFixed(2)})，${lastTouchTeamVal}队击球出界，${winner}队得分`;
          }

          state.ended = true;
          state.endTime = event.t;
          explanations.push({
            step,
            time: event.t,
            eventType: event.type,
            eventId: event.id,
            action: eventToAction(event.type),
            ruleReference: ruleForEventType(event.type),
            outcome,
          });
        } else {
          let outcome = "球落地";
          const lastTouch = state.touchHistory[state.touchHistory.length - 1];
          if (lastTouch) {
            state.ended = true;
            state.endTime = event.t;
            outcome = `${opponent(lastTouch.team)}队得分`;
          }
          explanations.push({
            step,
            time: event.t,
            eventType: event.type,
            eventId: event.id,
            action: eventToAction(event.type),
            ruleReference: ruleForEventType(event.type),
            outcome,
          });
        }
        break;
      }

      case "challenge_review": {
        const prevOutcome =
          explanations[explanations.length - 1]?.outcome || "";
        const overturned = event.challenge_overturned === true;

        if (overturned && state.violations.length > 0) {
          const lastViolation = state.violations[state.violations.length - 1];
          state.violations.pop();
          state.challengeOverturned = true;
          const newTeam = opponent(lastViolation.team);
          explanations.push({
            step,
            time: event.t,
            eventType: event.type,
            eventId: event.id,
            action: eventToAction(event.type),
            ruleReference: ruleForEventType(event.type),
            outcome: `挑战成功！原判罚"${lastViolation.description}"被推翻，${newTeam}队得分`,
          });
        } else if (overturned) {
          state.challengeOverturned = true;
          explanations.push({
            step,
            time: event.t,
            eventType: event.type,
            eventId: event.id,
            action: eventToAction(event.type),
            ruleReference: ruleForEventType(event.type),
            outcome: `挑战成功！原判罚被推翻，重新判定得分`,
          });
        } else {
          explanations.push({
            step,
            time: event.t,
            eventType: event.type,
            eventId: event.id,
            action: eventToAction(event.type),
            ruleReference: ruleForEventType(event.type),
            outcome: `挑战失败，维持原判：${prevOutcome}`,
          });
        }
        break;
      }
    }

    if (event.trajectory && event.trajectory.length > 0) {
      const evAnalysis = analyzeTrajectory(eventTrajectory, court);

      if (evAnalysis.netCrossings.length > 0) {
        const lastCrossing =
          evAnalysis.netCrossings[evAnalysis.netCrossings.length - 1];
        const lastTouch = state.touchHistory[state.touchHistory.length - 1];
        const alreadyRecorded = state.netCrossings.some(
          (nc) => Math.abs(nc.time - lastCrossing.time) < 0.02,
        );

        if (
          !lastCrossing.cleared &&
          !alreadyRecorded &&
          lastTouch &&
          !state.ended
        ) {
          const violation: Violation = {
            type: "ball_not_cleared_net",
            team: lastTouch.team,
            description: `${lastTouch.team}队扣球/击球未过网，球在高度${lastCrossing.height.toFixed(2)}m处触网（网高${court.netHeight}m）`,
            time: lastCrossing.time,
          };
          addViolation(state, violation);
          step++;
          explanations.push({
            step,
            time: lastCrossing.time,
            eventType: event.type,
            team: lastTouch.team,
            action: "球未过网",
            ruleReference: "排球规则 10 - 球过网",
            outcome: `犯规：${lastTouch.team}队击球未过网（高${lastCrossing.height.toFixed(2)}m < 网高${court.netHeight}m），${opponent(lastTouch.team)}队得分`,
          });
        }

        if (lastCrossing.hitAntenna && !state.ended && lastTouch) {
          const violation: Violation = {
            type: "antenna_hit",
            team: lastTouch.team,
            description: `${lastTouch.team}队击球触及标志杆`,
            time: lastCrossing.time,
          };
          addViolation(state, violation);
          step++;
          explanations.push({
            step,
            time: lastCrossing.time,
            eventType: event.type,
            team: lastTouch.team,
            action: "球触及标志杆",
            ruleReference: "排球规则 10.1.2 - 标志杆",
            outcome: `犯规：${lastTouch.team}队击球触及标志杆，${opponent(lastTouch.team)}队得分`,
          });
        }
      }
    }
  }

  let winner: Team = rally.servingTeam;
  let reason = "比赛进行中";

  if (state.violations.length > 0) {
    const v = state.violations[state.violations.length - 1];
    winner = opponent(v.team);
    reason = v.description;
  } else if (state.landings.length > 0 && state.touchHistory.length > 0) {
    const lastTouch = state.touchHistory[state.touchHistory.length - 1];
    const firstLanding = state.landings[0];
    if (firstLanding.inBounds || firstLanding.onLine) {
      winner = opponent(firstLanding.teamSide);
      reason = `球落在${firstLanding.teamSide}方场地${firstLanding.onLine ? "压线" : "界内"}，${winner}队得分`;
    } else {
      winner = opponent(lastTouch.team);
      reason = `${lastTouch.team}队击球出界，${winner}队得分`;
    }
  } else if (!state.ended && explanations.length > 0) {
    const lastExp = explanations[explanations.length - 1];
    const match = lastExp.outcome.match(/([AB])队得分/);
    if (match) {
      winner = match[1] as Team;
      reason = lastExp.outcome;
    }
  }

  if (state.challengeOverturned) {
    winner = opponent(winner);
    reason = `挑战推翻原判，${winner}队得分`;
  }

  return {
    rallyId: rally.id,
    rallyName: rally.name,
    winner,
    reason,
    state,
    violations: state.violations,
    explanation: explanations,
  };
}

export function processBatch(
  rallies: Rally[],
  initialScore: { A: number; B: number } = { A: 0, B: 0 },
): BatchResult {
  const scoreA = initialScore.A;
  const scoreB = initialScore.B;
  const matchScore: MatchScore = {
    teamA: scoreA,
    teamB: scoreB,
    rallyResults: [],
  };

  let teamACount = 0;
  let teamBCount = 0;
  const rallyResults: RallyResult[] = [];

  for (const rally of rallies) {
    const result = processRally(rally);
    rallyResults.push(result);

    if (result.winner === "A") {
      matchScore.teamA++;
      teamACount++;
    } else {
      matchScore.teamB++;
      teamBCount++;
    }

    matchScore.rallyResults.push({
      rallyId: rally.id,
      rallyName: rally.name,
      winner: result.winner,
      scoreAfter: { A: matchScore.teamA, B: matchScore.teamB },
    });
  }

  return {
    rallies: rallyResults,
    matchScore,
    summary: {
      totalRallies: rallies.length,
      teamAWins: teamACount,
      teamBWins: teamBCount,
    },
  };
}

export function explainRallyResult(result: RallyResult): string[] {
  const lines: string[] = [];
  lines.push(`=== 回合 ${result.rallyId}: ${result.rallyName} ===`);
  lines.push(`胜方: 队${result.winner}`);
  lines.push(`原因: ${result.reason}`);
  lines.push("");
  lines.push("--- 裁判解释 ---");
  for (const exp of result.explanation) {
    lines.push(`[${exp.step}] t=${exp.time.toFixed(2)}s | ${exp.action}`);
    lines.push(`    规则: ${exp.ruleReference}`);
    lines.push(`    结果: ${exp.outcome}`);
  }
  if (result.violations.length > 0) {
    lines.push("");
    lines.push("--- 违规记录 ---");
    for (const v of result.violations) {
      lines.push(`  t=${v.time.toFixed(2)}s 队${v.team}: ${v.description}`);
    }
  }
  return lines;
}
