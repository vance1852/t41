export type Team = "A" | "B";

export type EventType =
  | "serve"
  | "receive"
  | "set"
  | "spike"
  | "block"
  | "touch_net"
  | "landing"
  | "challenge_review";

export interface TrajectoryPoint {
  t: number;
  x: number;
  y: number;
  z: number;
}

export interface RallyEvent {
  id: string;
  type: EventType;
  t: number;
  team?: Team;
  player?: number;
  note?: string;
  trajectory?: TrajectoryPoint[];
  challenge_overturned?: boolean;
}

export interface Rally {
  id: string;
  name: string;
  servingTeam: Team;
  courtLength: number;
  courtWidth: number;
  netHeight: number;
  events: RallyEvent[];
  trajectory?: TrajectoryPoint[];
}

export interface Violation {
  type:
    | "four_touches"
    | "consecutive_touches"
    | "ball_not_cleared_net"
    | "ball_out"
    | "ball_in"
    | "touch_net"
    | "antenna_hit"
    | "back_row_attack"
    | "unknown";
  team: Team;
  description: string;
  time: number;
  eventId?: string;
}

export interface NetCrossing {
  time: number;
  height: number;
  x: number;
  cleared: boolean;
  hitAntenna: boolean;
}

export interface LandingPoint {
  time: number;
  x: number;
  y: number;
  inBounds: boolean;
  onLine: boolean;
  teamSide: Team;
}

export interface TouchRecord {
  team: Team;
  player: number;
  time: number;
  eventType: EventType;
  eventId: string;
  isBlock: boolean;
}

export interface RallyState {
  currentTeamSide: Team;
  touchesByTeam: Record<Team, number>;
  lastTouchByPlayer: Record<Team, number | null>;
  lastTouchTeam: Team | null;
  touchHistory: TouchRecord[];
  netCrossings: NetCrossing[];
  landings: LandingPoint[];
  violations: Violation[];
  ballSide: Team;
  ended: boolean;
  endTime: number | null;
}

export interface RallyResult {
  rallyId: string;
  rallyName: string;
  winner: Team;
  reason: string;
  state: RallyState;
  violations: Violation[];
  explanation: JudgeExplanation[];
}

export interface JudgeExplanation {
  step: number;
  time: number;
  eventType: EventType;
  team?: Team;
  player?: number;
  action: string;
  ruleReference: string;
  outcome: string;
  eventId?: string;
}

export interface MatchScore {
  teamA: number;
  teamB: number;
  rallyResults: Array<{
    rallyId: string;
    rallyName: string;
    winner: Team;
    scoreAfter: { A: number; B: number };
  }>;
}

export interface BatchResult {
  rallies: RallyResult[];
  matchScore: MatchScore;
  summary: {
    totalRallies: number;
    teamAWins: number;
    teamBWins: number;
  };
}
