import type { AppData } from '../types';
import { logsOn, sum } from './nutrition';
import { addDays, parseISO, toISO, todayISO } from './date';

export interface DayEnergy { date: string; eaten: number; logged: boolean; burned: number | null; active: number | null; net: number | null }

export function energyOn(d: AppData, date: string): DayEnergy {
  const logs = logsOn(d, date);
  const eaten = sum(logs).kcal;
  const h = d.healthDays.find((x) => x.date === date);
  const burned = h?.caloriesOut ?? null;
  return { date, eaten, logged: logs.length > 0, burned, active: h?.activeKcal ?? null, net: burned != null && logs.length ? eaten - burned : null };
}

/** Last n complete days (not today, whose burn is still climbing) with both food logged and calories burned. */
export function recentBalance(d: AppData, n = 7) {
  const days: DayEnergy[] = [];
  for (let i = 1; i <= n; i++) days.push(energyOn(d, toISO(addDays(parseISO(todayISO()), -i))));
  const full = days.filter((x) => x.net != null);
  const avg = full.length ? Math.round(full.reduce((a, x) => a + x.net!, 0) / full.length) : null;
  return { days: days.reverse(), full: full.length, avg, weeklyLb: avg != null ? Math.round((avg * 7 / 3500) * 10) / 10 : null };
}
