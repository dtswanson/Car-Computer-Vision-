
import { SavedRun, TrackData } from '../types';

const STORAGE_KEY = 'polytrack_optimizer_db';

// Generate a simple signature for the track to allow filtering runs by track layout
export const generateTrackSignature = (track: TrackData): string => {
  if (!track.center || track.center.length === 0) return "empty";
  // Sum of first and last points as a simple hash
  const p1 = track.center[0];
  const p2 = track.center[Math.floor(track.center.length / 2)];
  const p3 = track.center[track.center.length - 1];
  return `${p1.x.toFixed(0)}${p1.y.toFixed(0)}-${p2.x.toFixed(0)}${p2.y.toFixed(0)}-${p3.x.toFixed(0)}${p3.y.toFixed(0)}`;
};

export const saveRun = (run: SavedRun): void => {
  try {
    const existing = getSavedRuns();
    const updated = [run, ...existing].slice(0, 50); // Keep last 50
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to save run", e);
  }
};

export const getSavedRuns = (): SavedRun[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load runs", e);
    return [];
  }
};

export const deleteRun = (id: string): void => {
  try {
    const existing = getSavedRuns();
    const updated = existing.filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error("Failed to delete run", e);
  }
};

export const getRunsForTrack = (track: TrackData): SavedRun[] => {
  const signature = generateTrackSignature(track);
  return getSavedRuns().filter(r => r.trackSignature === signature);
};
