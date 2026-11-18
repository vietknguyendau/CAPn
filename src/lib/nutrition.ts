import type { AppData, Food, FoodLogEntry, Macros, Meal, NutritionSettings } from '../types';
import { supabase } from './cloud';

export const MEALS: { id: Meal; label: string }[] = [
  { id: 'breakfast', label: 'Breakfast' }, { id: 'lunch', label: 'Lunch' }, { id: 'dinner', label: 'Dinner' }, { id: 'snack', label: 'Snacks' },
];

export const DEFAULT_NUTRITION: NutritionSettings = { showCalories: true, targets: { kcal: null, protein: null, carbs: null, fat: null } };
export const nutritionOf = (d: AppData) => d.settings.nutrition ?? DEFAULT_NUTRITION;

const r1 = (n: number) => Math.round(n * 10) / 10;
export const ZERO: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0, sodiumMg: 0 };

export function scale(per100g: Macros, grams: number): Macros {
  const f = grams / 100;
  const opt = (v: number | null) => (v == null ? null : r1(v * f));
  return { kcal: Math.round(per100g.kcal * f), protein: r1(per100g.protein * f), carbs: r1(per100g.carbs * f), fat: r1(per100g.fat * f),
    fiber: opt(per100g.fiber), sugar: opt(per100g.sugar), sodiumMg: per100g.sodiumMg == null ? null : Math.round(per100g.sodiumMg * f) };
}

export function sum(entries: { totals: Macros }[]): Macros {
  return entries.reduce<Macros>((a, e) => ({
    kcal: a.kcal + e.totals.kcal, protein: r1(a.protein + e.totals.protein), carbs: r1(a.carbs + e.totals.carbs), fat: r1(a.fat + e.totals.fat),
    fiber: r1((a.fiber ?? 0) + (e.totals.fiber ?? 0)), sugar: r1((a.sugar ?? 0) + (e.totals.sugar ?? 0)), sodiumMg: (a.sodiumMg ?? 0) + (e.totals.sodiumMg ?? 0),
  }), { ...ZERO });
}

export const logsOn = (d: AppData, date: string) => d.foodLogs.filter((l) => l.date === date);

/** Mifflin-St Jeor estimate. A starting point only. */
export function estimateTargets(p: { sex: 'male' | 'female'; age: number; heightIn: number; weightLb: number; activity: number; goal: 'lose' | 'lose-slow' | 'maintain' | 'gain-slow' }) {
  const kg = p.weightLb * 0.4536, cm = p.heightIn * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'male' ? 5 : -161);
  const tdee = bmr * p.activity;
  const adj = { lose: -500, 'lose-slow': -250, maintain: 0, 'gain-slow': 250 }[p.goal];
  const floor = p.sex === 'male' ? 1500 : 1200;
  const kcal = Math.max(floor, Math.round((tdee + adj) / 10) * 10);
  const protein = Math.round(p.weightLb * 0.7);
  const fat = Math.round((kcal * 0.3) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, carbs, fat, tdee: Math.round(tdee), floored: tdee + adj < floor };
}

// ── food search API (Vercel functions) ──
export interface FoodResult extends Omit<Food, 'favorite' | 'lastUsed'> { kind: 'generic' | 'branded' }

async function call<T>(path: string): Promise<T> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  const r = await fetch(`/api/food/${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!(r.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Food search runs on Vercel. It isn’t available in this preview.');
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? 'Food search failed.');
  return body as T;
}
export const foodApi = {
  search: (q: string) => call<{ generic: FoodResult[]; branded: FoodResult[] }>(`search?q=${encodeURIComponent(q)}`),
  barcode: (code: string) => call<{ food: FoodResult | null }>(`barcode?code=${encodeURIComponent(code)}`),
};

/** Recently logged foods, newest first, one per name. */
export function recentFoods(d: AppData, limit = 25): FoodLogEntry[] {
  const seen = new Set<string>();
  return [...d.foodLogs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).filter((l) => {
    const k = `${l.name}|${l.brand ?? ''}|${l.servingLabel}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  }).slice(0, limit);
}
