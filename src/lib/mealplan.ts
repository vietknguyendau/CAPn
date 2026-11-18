import { INGREDIENTS, MEALS, type Aisle, type MealDef, type Slot } from '../data/meals';
import type { Macros } from '../types';

export type ProteinPref = 'chicken' | 'beef' | 'pork' | 'turkey' | 'fish' | 'eggs' | 'dairy' | 'plant';
export type Diet = 'none' | 'vegetarian' | 'pescatarian' | 'no-pork' | 'dairy-free' | 'gluten-free';
export interface MealPrefs { mealsPerDay: 3 | 4 | 5; proteins: ProteinPref[]; diet: Diet; avoid: string[] }
export interface Targets { kcal: number; protein: number; carbs: number | null; fat: number | null }
export interface PlannedMeal { mealId: string; slot: Slot; scale: number; extra?: boolean }
export interface PlanDay { meals: PlannedMeal[] }
export interface MealPlan { createdAt: string; weekStart: string; prefs: MealPrefs; targets: Targets; days: PlanDay[] }

export const PROTEIN_LABEL: Record<ProteinPref, string> = { chicken: 'Chicken', beef: 'Beef', pork: 'Pork', turkey: 'Turkey', fish: 'Fish & seafood', eggs: 'Eggs', dairy: 'Dairy', plant: 'Plant protein' };
export const DIET_LABEL: Record<Diet, string> = { none: 'No restrictions', vegetarian: 'Vegetarian', pescatarian: 'Pescatarian', 'no-pork': 'No pork', 'dairy-free': 'Dairy-free', 'gluten-free': 'Gluten-free' };

const byId = new Map(MEALS.map((m) => [m.id, m]));
export const mealById = (id: string) => byId.get(id);
const tagsOf = (m: MealDef) => new Set(m.items.flatMap(([k]) => INGREDIENTS[k]?.tags ?? []));

export function mealMacros(m: MealDef, scale = 1): Macros & { fiberG: number; grams: number } {
  let kcal = 0, p = 0, c = 0, f = 0, fiber = 0, grams = 0;
  for (const [k, g0] of m.items) {
    const ing = INGREDIENTS[k]; const g = g0 * scale; const x = g / 100;
    kcal += ing.kcal * x; p += ing.p * x; c += ing.c * x; f += ing.f * x; fiber += ing.fiber * x; grams += g;
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { kcal: Math.round(kcal), protein: r1(p), carbs: r1(c), fat: r1(f), fiber: r1(fiber), fiberG: r1(fiber), sugar: null, sodiumMg: null, grams: Math.round(grams) };
}

function allowed(m: MealDef, prefs: MealPrefs): boolean {
  const t = tagsOf(m);
  const meat = t.has('chicken') || t.has('beef') || t.has('pork') || t.has('turkey');
  if (prefs.diet === 'vegetarian' && (meat || t.has('fish'))) return false;
  if (prefs.diet === 'pescatarian' && meat) return false;
  if (prefs.diet === 'no-pork' && t.has('pork')) return false;
  if (prefs.diet === 'dairy-free' && t.has('dairy')) return false;
  if (prefs.diet === 'gluten-free' && t.has('gluten')) return false;
  if (prefs.avoid.some((a) => m.items.some(([k]) => INGREDIENTS[k].name.toLowerCase().includes(a.toLowerCase())))) return false;
  // Meat and fish must be ones they picked. Meatless meals (eggs, dairy, plant) are always fine unless the diet rules them out.
  const meats = (['chicken', 'beef', 'pork', 'turkey', 'fish'] as ProteinPref[]).filter((x) => t.has(x));
  if (!prefs.proteins.length || !meats.length) return true;
  return meats.some((x) => prefs.proteins.includes(x));
}

export const SLOT_SHARES: Record<number, { slot: Slot; share: number }[]> = {
  3: [{ slot: 'breakfast', share: 0.28 }, { slot: 'lunch', share: 0.36 }, { slot: 'dinner', share: 0.36 }],
  4: [{ slot: 'breakfast', share: 0.25 }, { slot: 'lunch', share: 0.3 }, { slot: 'dinner', share: 0.3 }, { slot: 'snack', share: 0.15 }],
  5: [{ slot: 'breakfast', share: 0.22 }, { slot: 'snack', share: 0.1 }, { slot: 'lunch', share: 0.29 }, { slot: 'snack', share: 0.1 }, { slot: 'dinner', share: 0.29 }],
};

// Small seeded RNG so a plan is reproducible and "regenerate" gives a fresh one.
function rng(seed: number) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

export function dayTotals(day: PlanDay) {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const pm of day.meals) { const m = mealById(pm.mealId); if (!m) continue; const x = mealMacros(m, pm.scale); t.kcal += x.kcal; t.protein += x.protein; t.carbs += x.carbs; t.fat += x.fat; t.fiber += x.fiberG; }
  return { kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat), fiber: Math.round(t.fiber) };
}

function score(day: PlanDay, T: Targets, used: Map<string, number>) {
  const t = dayTotals(day);
  let s = Math.abs(t.kcal - T.kcal) / T.kcal;
  s += 2 * Math.max(0, T.protein - t.protein) / T.protein + 0.4 * Math.max(0, t.protein - T.protein * 1.35) / T.protein;
  if (T.carbs) s += 0.3 * Math.abs(t.carbs - T.carbs) / T.carbs;
  if (T.fat) s += 0.3 * Math.abs(t.fat - T.fat) / T.fat;
  s += 0.2 * Math.max(0, 28 - t.fiber) / 28;
  for (const pm of day.meals) if (!pm.extra) s += 0.35 * (used.get(pm.mealId) ?? 0) ** 1.5;
  return s;
}

/** Portion scale so a meal lands near its share of the day's calories. Rounded to quarters. */
const fitScale = (m: MealDef, kcal: number) => Math.min(1.75, Math.max(0.5, Math.round((kcal / Math.max(1, mealMacros(m).kcal)) * 4) / 4));

export function planDay(T: Targets, prefs: MealPrefs, used: Map<string, number>, seed: number, lockSlotIdx?: number, lockedDay?: PlanDay): PlanDay | null {
  const rand = rng(seed);
  const shares = SLOT_SHARES[prefs.mealsPerDay];
  const pools = shares.map(({ slot }) => MEALS.filter((m) => m.slot === slot && allowed(m, prefs)));
  if (pools.some((p) => !p.length)) return null;
  let best: PlanDay | null = null, bestScore = Infinity;
  for (let i = 0; i < 500; i++) {
    const meals = shares.map(({ slot, share }, k) => {
      if (lockedDay && lockSlotIdx != null && k !== lockSlotIdx) return { ...lockedDay.meals[k] };
      const pool = pools[k];
      let m = pool[Math.floor(rand() * pool.length)];
      if (lockedDay && lockSlotIdx === k && m.id === lockedDay.meals[k].mealId && pool.length > 1) m = pool[(pool.indexOf(m) + 1) % pool.length];
      return { mealId: m.id, slot, scale: fitScale(m, T.kcal * share) };
    });
    if (new Set(meals.map((x) => x.mealId)).size < meals.length) continue; // no duplicate meal in a day
    const day = { meals };
    const sc = score(day, T, used);
    if (sc < bestScore) { bestScore = sc; best = day; }
  }
  return best ? topUp(best, T, prefs, used) : null;
}

const TOP_UPS = ['protein-shake', 'yogurt-berries', 'cottage-strawberries', 'tuna-snack', 'edamame-snack'];
/** If the day is still short on protein, add a small high-protein snack and trim the other portions to make room. */
function topUp(day: PlanDay, T: Targets, prefs: MealPrefs, used: Map<string, number>): PlanDay {
  if (dayTotals(day).protein >= T.protein * 0.93) return day;
  let best = day, bestScore = score(day, T, used);
  for (const id of TOP_UPS) {
    const m = byId.get(id);
    if (!m || !allowed(m, prefs) || day.meals.some((x) => x.mealId === id)) continue;
    const extra = mealMacros(m).kcal;
    const shares = SLOT_SHARES[prefs.mealsPerDay];
    const meals = day.meals.map((pm, k) => ({ ...pm, scale: fitScale(byId.get(pm.mealId)!, (T.kcal - extra) * shares[k].share) }));
    const candidate = { meals: [...meals, { mealId: id, slot: 'snack' as Slot, scale: 1, extra: true }] };
    const sc = score(candidate, T, used);
    if (sc < bestScore) { best = candidate; bestScore = sc; }
  }
  return best;
}

export function planWeek(T: Targets, prefs: MealPrefs, weekStart: string, seed = Date.now()): MealPlan | null {
  const used = new Map<string, number>();
  const days: PlanDay[] = [];
  for (let d = 0; d < 7; d++) {
    const day = planDay(T, prefs, used, seed + d * 7919);
    if (!day) return null;
    for (const pm of day.meals) used.set(pm.mealId, (used.get(pm.mealId) ?? 0) + 1);
    days.push(day);
  }
  return { createdAt: new Date().toISOString(), weekStart, prefs, targets: T, days };
}

export function swapMeal(plan: MealPlan, dayIdx: number, slotIdx: number, seed = Date.now()): MealPlan {
  const used = new Map<string, number>();
  plan.days.forEach((d, i) => { if (i !== dayIdx) for (const pm of d.meals) used.set(pm.mealId, (used.get(pm.mealId) ?? 0) + 1); });
  const day = planDay(plan.targets, plan.prefs, used, seed, slotIdx, plan.days[dayIdx]);
  if (!day) return plan;
  const days = plan.days.slice(); days[dayIdx] = day;
  return { ...plan, days };
}

/** Friendly amount: "2 large eggs (100 g)", "1¼ cups (200 g)", or grams. */
export function amount(key: string, grams: number): string {
  const ing = INGREDIENTS[key];
  const g = Math.round(grams / 5) * 5 || Math.round(grams);
  if (!ing.unit) return `${g} g`;
  const n = grams / ing.unit.g;
  const q = Math.round(n * 4) / 4;
  if (q < 0.25) return `${g} g`;
  const whole = Math.floor(q), frac = q - whole;
  const fr = frac === 0.25 ? '¼' : frac === 0.5 ? '½' : frac === 0.75 ? '¾' : '';
  const num = `${whole || ''}${fr}` || '0';
  const label = ing.unit.label.startsWith('½') ? `× ${ing.unit.label}` : q > 1 && !/s$/.test(ing.unit.label) ? `${ing.unit.label}s` : ing.unit.label;
  return `${num} ${label} (${g} g)`;
}

export function groceryList(plan: MealPlan, dayIdx?: number[]) {
  const totals = new Map<string, number>();
  plan.days.forEach((d, i) => {
    if (dayIdx && !dayIdx.includes(i)) return;
    for (const pm of d.meals) { const m = mealById(pm.mealId); if (!m) continue; for (const [k, g] of m.items) totals.set(k, (totals.get(k) ?? 0) + g * pm.scale); }
  });
  const groups: Record<Aisle, { key: string; name: string; grams: number; text: string }[]> = { Protein: [], 'Dairy & eggs': [], Produce: [], 'Grains & bread': [], Pantry: [] };
  for (const [k, g] of totals) {
    const ing = INGREDIENTS[k];
    const lb = g / 453.6;
    const countable = ing.unit && /egg|tortilla|slice|banana|apple|can|scoop/.test(ing.unit.label);
    const text = countable ? `${Math.ceil(g / ing.unit!.g - 0.1)} ${ing.unit!.label}${Math.ceil(g / ing.unit!.g - 0.1) > 1 ? 's' : ''}` : ing.unit ? amount(k, g) : g >= 450 ? `${(Math.round(lb * 4) / 4).toString()} lb (${Math.round(g)} g)` : `${Math.round(g / 5) * 5} g`;
    groups[ing.aisle].push({ key: k, name: ing.name, grams: g, text });
  }
  for (const a of Object.keys(groups) as Aisle[]) groups[a].sort((x, y) => x.name.localeCompare(y.name));
  return groups;
}
