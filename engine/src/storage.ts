import type { ProgressStore, TourProgress } from "./types";

/** Stores completed/skipped state per tour in localStorage, namespaced by app. */
export function localProgressStore(app: string): ProgressStore {
  const prefix = `gt:${app}:progress:`;
  return {
    get(tourId) {
      try {
        const raw = localStorage.getItem(prefix + tourId);
        return raw ? (JSON.parse(raw) as TourProgress) : null;
      } catch {
        return null;
      }
    },
    set(tourId, progress) {
      try {
        localStorage.setItem(prefix + tourId, JSON.stringify(progress));
      } catch {
        /* storage blocked: the tour simply may auto-start again */
      }
    },
    clear(tourId) {
      try {
        if (tourId) return localStorage.removeItem(prefix + tourId);
        Object.keys(localStorage)
          .filter((k) => k.startsWith(prefix))
          .forEach((k) => localStorage.removeItem(k));
      } catch {
        /* ignore */
      }
    },
  };
}

/** A tour in flight across a page load. sessionStorage keeps it to this tab. */
export interface ResumeState {
  tourId: string;
  stepIndex: number;
  direction: 1 | -1;
  at: number;
}

const RESUME_TTL_MS = 60_000;

export function saveResume(app: string, state: ResumeState): void {
  try {
    sessionStorage.setItem(`gt:${app}:resume`, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

/** Read and clear the pending resume, ignoring stale entries. */
export function takeResume(app: string): ResumeState | null {
  try {
    const key = `gt:${app}:resume`;
    const raw = sessionStorage.getItem(key);
    sessionStorage.removeItem(key);
    if (!raw) return null;
    const state = JSON.parse(raw) as ResumeState;
    return Date.now() - state.at < RESUME_TTL_MS ? state : null;
  } catch {
    return null;
  }
}
