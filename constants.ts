import { Point, TrackData } from './types';

// Simple oval-ish track for default
const OUTER_POINTS: Point[] = [
  { x: 100, y: 100 },
  { x: 400, y: 50 },
  { x: 700, y: 100 },
  { x: 750, y: 300 },
  { x: 700, y: 500 },
  { x: 400, y: 550 },
  { x: 100, y: 500 },
  { x: 50, y: 300 },
];

const INNER_POINTS: Point[] = [
  { x: 200, y: 200 },
  { x: 400, y: 150 },
  { x: 600, y: 200 },
  { x: 650, y: 300 },
  { x: 600, y: 400 },
  { x: 400, y: 450 },
  { x: 200, y: 400 },
  { x: 150, y: 300 },
];

// Calculate center line
const CENTER_POINTS: Point[] = OUTER_POINTS.map((p, i) => ({
  x: (p.x + INNER_POINTS[i].x) / 2,
  y: (p.y + INNER_POINTS[i].y) / 2,
}));

export const INITIAL_TRACK: TrackData = {
  outer: OUTER_POINTS,
  inner: INNER_POINTS,
  center: CENTER_POINTS,
};

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const AGENT_COUNT = 20;
export const FPS = 60;
