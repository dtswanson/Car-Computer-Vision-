
export interface Point {
  x: number;
  y: number;
}

export interface TrackData {
  outer: Point[];
  inner: Point[];
  center: Point[];
}

export interface SimulationState {
  generation: number;
  bestReward: number;
  currentReward: number;
  bestLapTime: number;
  isRunning: boolean;
  agents: Agent[];
}

export interface Agent {
  id: number;
  position: Point;
  path: Point[];
  color: string;
  progress: number; // 0 to 1 along the path
  speed: number;
  crashed: boolean;
  angle: number; // Rotation in radians
}

export interface ChartDataPoint {
  generation: number;
  reward: number;
  lapTime: number;
}

export interface SavedRun {
  id: string;
  timestamp: number;
  name: string; // e.g., "Gen 54 - 12.4s"
  generation: number;
  reward: number;
  lapTime: number;
  path: Point[];
  trackSignature: string; // To match runs to the current track geometry
}

export enum OptimizationMode {
  HEURISTIC = 'HEURISTIC',
  GEMINI_AI = 'GEMINI_AI',
}
