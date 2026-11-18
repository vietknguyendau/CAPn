import type { AppData } from '../types';
import { emptyData, seedData } from '../data/seed';

// How the store persists data. Local mode uses localStorage; cloud mode uses CloudSync.
export interface Persistence {
  save(data: AppData): void;
  reset(): AppData;
}

export const LEGACY_KEY = 'momentum:v1';

export function parseData(raw: string | null, fallback: () => AppData): AppData {
  try {
    if (!raw) return fallback();
    const parsed = JSON.parse(raw) as AppData;
    if (parsed.version !== 1) return fallback();
    return normalize(parsed);
  } catch {
    return fallback();
  }
}

// Fill in any fields added in newer versions of the app.
export function normalize(d: Partial<AppData>): AppData {
  const base = emptyData();
  return { ...base, ...d, settings: { ...base.settings, ...(d.settings ?? {}) }, draft: d.draft ?? base.draft, routines: d.routines ?? [], healthDays: d.healthDays ?? [], customExercises: d.customExercises ?? [], foods: d.foods ?? [], foodLogs: d.foodLogs ?? [] } as AppData;
}

export const localRepository: Persistence & { load(): AppData } = {
  load() {
    try { return parseData(localStorage.getItem(LEGACY_KEY), seedData); } catch { return seedData(); }
  },
  save(data) {
    try { localStorage.setItem(LEGACY_KEY, JSON.stringify(data)); } catch { /* storage full or blocked */ }
  },
  reset() {
    try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
    return seedData();
  },
};

export function hasLegacyData(): AppData | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const d = parseData(raw, emptyData);
    return d.workouts.length || d.checkIns.length || d.routines.length ? d : null;
  } catch { return null; }
}
