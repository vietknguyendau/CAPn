import { createClient } from '@supabase/supabase-js';
import type { AppData } from '../types';
import { emptyData } from '../data/seed';
import { normalize, type Persistence } from './storage';

// Read the auth link type before the client consumes the URL hash.
const hash = typeof window !== 'undefined' ? window.location.hash : '';
export const authLinkType: 'invite' | 'recovery' | null =
  /type=invite/.test(hash) ? 'invite' : /type=recovery/.test(hash) ? 'recovery' : null;

// Tolerate common paste mistakes: trailing slash or a copied /rest/v1 path.
const url = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/(rest|auth)\/v1\/?$/, '').replace(/\/+$/, '');
const key = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();
export const supabase = url && key ? createClient(url, key) : null;
export const cloudEnabled = !!supabase;

type Collection = 'workouts' | 'checkIns' | 'bodyweight' | 'routines' | 'healthDays' | 'customExercises' | 'foods' | 'foodLogs';
const TABLES: Record<Collection, { table: string; date: (x: any) => string | null }> = {
  workouts: { table: 'workouts', date: (x) => x.date ?? null },
  checkIns: { table: 'check_ins', date: (x) => x.date ?? null },
  bodyweight: { table: 'bodyweight', date: (x) => x.date ?? null },
  routines: { table: 'routines', date: () => null },
  healthDays: { table: 'health_days', date: (x) => x.date ?? null },
  customExercises: { table: 'custom_exercises', date: () => null },
  foods: { table: 'foods', date: () => null },
  foodLogs: { table: 'food_logs', date: (x) => x.date ?? null },
};

async function selectAll(table: string, userId: string) {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from(table).select('id, data').eq('user_id', userId).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Returns null for a brand-new account with nothing saved yet. */
export async function fetchAll(userId: string): Promise<AppData | null> {
  const [state, ...cols] = await Promise.all([
    supabase!.from('user_state').select('settings, draft, active').eq('user_id', userId).maybeSingle(),
    ...(Object.keys(TABLES) as Collection[]).map((c) => selectAll(TABLES[c].table, userId)),
  ]);
  if (state.error) throw state.error;
  const [workouts, checkIns, bodyweight, routines, healthDays, customExercises, foods, foodLogs] = cols as any[][];
  if (!state.data && !workouts.length && !checkIns.length) return null;
  return normalize({
    version: 1,
    workouts: workouts.map((r) => r.data),
    checkIns: checkIns.map((r) => r.data),
    bodyweight: bodyweight.map((r) => r.data),
    routines: routines.map((r) => r.data),
    healthDays: healthDays.map((r) => r.data),
    customExercises: customExercises.map((r) => r.data),
    foods: foods.map((r) => r.data),
    foodLogs: foodLogs.map((r) => r.data),
    settings: state.data?.settings ?? emptyData().settings,
    draft: state.data?.draft ?? undefined,
    active: state.data?.active ?? null,
  });
}

async function pushDiff(userId: string, prev: AppData | null, next: AppData) {
  const ops: PromiseLike<{ error: unknown }>[] = [];
  for (const c of Object.keys(TABLES) as Collection[]) {
    const { table, date } = TABLES[c];
    const before = new Map<string, string>(((prev?.[c] ?? []) as any[]).map((x) => [x.id, JSON.stringify(x)]));
    const nextItems = next[c] as any[];
    const upserts = nextItems.filter((x) => before.get(x.id) !== JSON.stringify(x))
      .map((x) => ({ user_id: userId, id: x.id, date: date(x), data: x, updated_at: new Date().toISOString() }));
    const ids = new Set(nextItems.map((x) => x.id));
    const deletes = [...before.keys()].filter((id) => !ids.has(id));
    if (upserts.length) ops.push(supabase!.from(table).upsert(upserts, { onConflict: 'user_id,id' }));
    if (deletes.length) ops.push(supabase!.from(table).delete().eq('user_id', userId).in('id', deletes));
  }
  const stateNow = JSON.stringify([next.settings, next.draft, next.active]);
  const stateBefore = prev ? JSON.stringify([prev.settings, prev.draft, prev.active]) : '';
  if (stateNow !== stateBefore) {
    ops.push(supabase!.from('user_state').upsert({ user_id: userId, settings: next.settings, draft: next.draft, active: next.active, updated_at: new Date().toISOString() }));
  }
  const results = await Promise.all(ops);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}

export type SyncStatus = 'synced' | 'saving' | 'offline' | 'error';

/** Debounced, offline-tolerant sync. Unsynced edits are cached on the device and pushed when back online. */
export class CloudSync implements Persistence {
  status: SyncStatus = 'synced';
  private listeners = new Set<(s: SyncStatus) => void>();
  private latest: AppData;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private cacheKey: string;

  constructor(private userId: string, current: AppData, private synced: AppData | null) {
    this.latest = current;
    this.cacheKey = `momentum:cloud:${userId}`;
  }

  start() {
    window.addEventListener('online', this.flushSoon);
    document.addEventListener('visibilitychange', this.onHide);
    this.writeCache();
    if (JSON.stringify(this.latest) !== JSON.stringify(this.synced)) this.flushSoon();
  }

  static readCache(userId: string): { data: AppData; synced: AppData | null } | null {
    try {
      const raw = localStorage.getItem(`momentum:cloud:${userId}`);
      if (!raw) return null;
      const c = JSON.parse(raw);
      return { data: normalize(c.data), synced: c.synced ? normalize(c.synced) : null };
    } catch { return null; }
  }

  subscribe(fn: (s: SyncStatus) => void) { this.listeners.add(fn); fn(this.status); return () => { this.listeners.delete(fn); }; }
  private setStatus(s: SyncStatus) { this.status = s; this.listeners.forEach((f) => f(s)); }

  private writeCache() {
    try { localStorage.setItem(this.cacheKey, JSON.stringify({ data: this.latest, synced: this.synced })); } catch { /* ignore */ }
  }

  save(d: AppData) {
    this.latest = d;
    this.writeCache();
    this.flushSoon();
  }

  reset(): AppData {
    const fresh = emptyData();
    this.save(fresh);
    return fresh;
  }

  private onHide = () => { if (document.visibilityState === 'hidden') this.flush(); };
  private flushSoon = () => { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 1200); };

  async flush() {
    if (this.running) return;
    if (JSON.stringify(this.latest) === JSON.stringify(this.synced)) { this.setStatus('synced'); return; }
    this.running = true;
    this.setStatus('saving');
    const target = this.latest;
    try {
      await pushDiff(this.userId, this.synced, target);
      this.synced = target;
      this.writeCache();
      this.setStatus(this.latest === target ? 'synced' : 'saving');
    } catch {
      this.setStatus(navigator.onLine ? 'error' : 'offline');
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), 15000);
    } finally {
      this.running = false;
      if (this.latest !== this.synced && this.status !== 'error' && this.status !== 'offline') this.flushSoon();
    }
  }

  dispose() {
    clearTimeout(this.timer);
    window.removeEventListener('online', this.flushSoon);
    document.removeEventListener('visibilitychange', this.onHide);
  }

  clearCache() { try { localStorage.removeItem(this.cacheKey); } catch { /* ignore */ } }
}
