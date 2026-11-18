import type { HealthDay } from '../types';
import { supabase } from './cloud';
import { addDays, parseISO, toISO } from './date';

export interface FitbitStatus {
  configured: boolean; connected: boolean; needsReconnect?: boolean;
  connectedAt?: string | null; lastSyncAt?: string | null; scopes?: string[];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await supabase!.auth.getSession();
  const token = data.session?.access_token;
  const r = await fetch(`/api/fitbit/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  const ct = r.headers.get('content-type') ?? '';
  if (!ct.includes('application/json')) throw Object.assign(new Error('The Fitbit server functions aren’t running here. Deploy to Vercel or use `vercel dev`.'), { status: r.status });
  const body = await r.json();
  if (!r.ok) throw Object.assign(new Error(body.error ?? 'Request failed'), { status: r.status, ...body });
  return body as T;
}

export const fitbitApi = {
  status: () => call<FitbitStatus>('status'),
  start: () => call<{ url: string }>('start', { method: 'POST' }),
  sync: (from: string, to: string) => call<{ days: Omit<HealthDay, 'id' | 'source' | 'syncedAt'>[]; missing: string[] }>('sync', { method: 'POST', body: JSON.stringify({ from, to }) }),
  disconnect: () => call<{ ok: true }>('disconnect', { method: 'POST' }),
};

export function syncRange(days: number, today = toISO(new Date())) {
  const end = toISO(addDays(parseISO(today), 1));
  return { from: toISO(addDays(parseISO(today), -(days - 1))), to: end };
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

export interface Readiness {
  level: 'easy' | 'steady' | 'good';
  title: string;
  detail: string;
  sleepMin: number | null;
  restingHr: number | null;
  baselineHr: number | null;
}

export const fmtSleep = (m: number | null) => (m == null ? '–' : `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`);

/** A gentle training suggestion from last night's sleep and resting heart rate vs. your own recent baseline. */
export function readiness(days: HealthDay[], today: string): Readiness | null {
  const t = days.find((d) => d.date === today);
  if (!t || (t.sleepMin == null && t.restingHr == null)) return null;
  const prior = days.filter((d) => d.date < today && d.restingHr != null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  const baselineHr = prior.length >= 5 ? Math.round(median(prior.map((d) => d.restingHr as number))) : null;
  const delta = t.restingHr != null && baselineHr != null ? t.restingHr - baselineHr : null;
  const lowSleep = t.sleepMin != null && t.sleepMin < 360;
  const highHr = delta != null && delta >= 5;
  const parts = [
    t.sleepMin != null ? `Slept ${fmtSleep(t.sleepMin)}` : null,
    delta != null ? (delta >= 3 ? `resting HR up ${delta} bpm` : delta <= -3 ? `resting HR down ${-delta} bpm` : 'resting HR near your usual') : t.restingHr != null ? `resting HR ${t.restingHr}` : null,
  ].filter(Boolean).join(', ');
  const base = { sleepMin: t.sleepMin, restingHr: t.restingHr, baselineHr };
  if (lowSleep || highHr) return { ...base, level: 'easy', title: 'Lighter day might feel better', detail: `${parts}. The 15-minute version or holding your weights steady both count.` };
  if ((t.sleepMin ?? 0) >= 420 && (delta == null || delta <= 2)) return { ...base, level: 'good', title: 'Well rested', detail: `${parts}. Good day for your planned session.` };
  return { ...base, level: 'steady', title: 'Normal day', detail: `${parts}. Train as planned and let your sets guide you.` };
}
