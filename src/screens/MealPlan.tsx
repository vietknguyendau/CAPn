import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, RefreshCw, Shuffle, ShoppingCart, SlidersHorizontal, X } from 'lucide-react';
import { useStore } from '../store';
import type { Meal } from '../types';
import { INGREDIENTS } from '../data/meals';
import { DIET_LABEL, PROTEIN_LABEL, amount, dayTotals, groceryList, mealById, mealMacros, planWeek, swapMeal, type Diet, type MealPlan as Plan, type MealPrefs, type ProteinPref } from '../lib/mealplan';
import { nutritionOf, scale } from '../lib/nutrition';
import { addDays, fmtShort, parseISO, toISO, todayISO, uid, weekStart, DAY_NAMES } from '../lib/date';
import { weightPlan, latestWeight } from '../lib/goals';
import { TargetsSheet } from '../components/TargetsSheet';
import { Badge, Btn, Chips, H2, Panel, Screen, cx } from '../components/ui';

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' } as const;

export default function MealPlan() {
  const { data, go } = useStore();
  const plan = data.settings.mealPlan;
  const [editing, setEditing] = useState(!plan);
  return (
    <Screen title="Meal plan" sub="Built around your protein and calories" right={<Btn variant="ghost" onClick={() => go('food')}><ChevronLeft size={18} />Back</Btn>}>
      {editing || !plan ? <Setup initial={plan?.prefs} onDone={() => setEditing(false)} /> : <PlanView plan={plan} onEdit={() => setEditing(true)} />}
      <p className="px-1 text-xs text-haze">Nutrition is calculated from standard USDA values for each ingredient. Brands and cooking vary, so treat numbers as close estimates. Check ingredients for allergies. Not medical or dietitian advice.</p>
    </Screen>
  );
}

function Setup({ initial, onDone }: { initial?: MealPrefs; onDone: () => void }) {
  const { data, update } = useStore();
  const n = nutritionOf(data);
  const [mealsPerDay, setMeals] = useState<MealPrefs['mealsPerDay']>(initial?.mealsPerDay ?? 4);
  const [proteins, setProteins] = useState<ProteinPref[]>(initial?.proteins ?? ['chicken', 'beef', 'pork', 'turkey', 'fish']);
  const [diet, setDiet] = useState<Diet>(initial?.diet ?? 'none');
  const [avoid, setAvoid] = useState((initial?.avoid ?? []).join(', '));
  const [targets, setTargets] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const goal = data.settings.goal;
  const wp = goal ? weightPlan(goal, latestWeight(data)?.value ?? null) : null;
  const ready = !!n.targets.kcal && !!n.targets.protein;

  const toggle = (p: ProteinPref) => setProteins((cur) => cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]);
  const generate = () => {
    const prefs: MealPrefs = { mealsPerDay, proteins, diet, avoid: avoid.split(',').map((x) => x.trim()).filter(Boolean) };
    const T = { kcal: n.targets.kcal!, protein: n.targets.protein!, carbs: n.targets.carbs, fat: n.targets.fat };
    const p = planWeek(T, prefs, toISO(weekStart(new Date())));
    if (!p) { setErr('Those choices leave too few meals. Allow another protein, or remove an ingredient you’re avoiding.'); return; }
    update((d) => { d.settings.mealPlan = p; return d; });
    onDone();
  };
  const pill = (on: boolean) => cx('min-h-[44px] rounded-full border px-4 text-sm font-semibold', on ? 'border-sun bg-sun text-ink' : 'border-rim text-chalk');

  return (
    <div className="space-y-4">
      <Panel tone={ready ? 'tide' : 'sun'}>
        <H2>Your daily targets</H2>
        {ready ? (
          <p><span className="font-display text-2xl">{n.targets.kcal!.toLocaleString()}</span> kcal · <span className="font-display text-2xl text-tide">{n.targets.protein}</span> g protein
            {n.targets.carbs ? ` · ${n.targets.carbs} g carbs` : ''}{n.targets.fat ? ` · ${n.targets.fat} g fat` : ''}</p>
        ) : <p className="text-sm">Set a calorie and protein target first. The planner sizes every portion to hit them.</p>}
        <Btn variant="ghost" className="mt-3 w-full" onClick={() => setTargets(true)}>{ready ? 'Change targets' : 'Set my targets'}</Btn>
      </Panel>

      <Panel>
        <H2>Meals per day</H2>
        <div className="flex gap-2">{([3, 4, 5] as const).map((m) => <button key={m} aria-pressed={mealsPerDay === m} onClick={() => setMeals(m)} className={pill(mealsPerDay === m)}>{m === 3 ? '3 meals' : m === 4 ? '3 + snack' : '3 + 2 snacks'}</button>)}</div>
        <H2>Proteins you like</H2>
        <div className="flex flex-wrap gap-2">
          {(['chicken', 'beef', 'pork', 'turkey', 'fish'] as ProteinPref[]).map((p) => <button key={p} aria-pressed={proteins.includes(p)} onClick={() => toggle(p)} className={pill(proteins.includes(p))}>{PROTEIN_LABEL[p]}</button>)}
        </div>
        <p className="mt-2 text-xs text-haze">Eggs, dairy and plant proteins are always included unless your diet rules them out.</p>
        <div className="mt-4"><H2>Diet</H2></div>
        <select value={diet} onChange={(e) => setDiet(e.target.value as Diet)} aria-label="Diet" className="min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk">
          {(Object.keys(DIET_LABEL) as Diet[]).map((d) => <option key={d} value={d}>{DIET_LABEL[d]}</option>)}
        </select>
        <label className="mt-3 block"><span className="mb-1 block text-sm text-haze">Ingredients to avoid (optional)</span>
          <input value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="e.g. shrimp, peanut, cottage cheese" className="min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun" /></label>
      </Panel>
      {err && <p className="text-sm text-flare" role="alert">{err}</p>}
      <Btn size="lg" className="w-full" disabled={!ready} onClick={generate}>Build my 7-day plan</Btn>
      {targets && <TargetsSheet onClose={() => setTargets(false)} preset={wp ? { lb: goal!.unit === 'lb' ? wp.now : Math.round(wp.now / 0.4536), goal: wp.dir === 'lose' ? (goal!.pace === 'steady' ? 'lose' : 'lose-slow') : wp.dir === 'gain' ? 'gain-slow' : 'maintain' } : undefined} />}
    </div>
  );
}

function Bar({ label, v, t, color, unit = 'g' }: { label: string; v: number; t: number | null; color: string; unit?: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="text-haze">{label}</span><span><span className="font-display text-lg">{v.toLocaleString()}</span>{t ? <span className="text-haze"> / {t.toLocaleString()}{unit}</span> : <span className="text-haze">{unit}</span>}</span></div>
      {t ? <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-rim"><div className="h-full rounded-full" style={{ width: `${Math.min(100, (v / t) * 100)}%`, background: color }} /></div> : null}
    </div>
  );
}

function PlanView({ plan, onEdit }: { plan: Plan; onEdit: () => void }) {
  const { data, update } = useStore();
  const todayIdx = Math.max(0, Math.min(6, Math.round((parseISO(todayISO()).getTime() - parseISO(plan.weekStart).getTime()) / 86_400_000)));
  const [day, setDay] = useState(todayIdx);
  const [open, setOpen] = useState<number | null>(null);
  const [logged, setLogged] = useState<Set<string>>(new Set());
  const [shop, setShop] = useState(false);
  const n = nutritionOf(data);
  const t = dayTotals(plan.days[day]);
  const stale = n.targets.kcal !== plan.targets.kcal || n.targets.protein !== plan.targets.protein;

  const regenerate = () => update((d) => { const p = planWeek(n.targets.kcal && n.targets.protein ? { kcal: n.targets.kcal, protein: n.targets.protein, carbs: n.targets.carbs, fat: n.targets.fat } : plan.targets, plan.prefs, toISO(weekStart(new Date()))); if (p) d.settings.mealPlan = p; return d; });
  const swap = (k: number) => update((d) => { d.settings.mealPlan = swapMeal(d.settings.mealPlan!, day, k); return d; });
  const logMeal = (k: number) => {
    const pm = plan.days[day].meals[k]; const m = mealById(pm.mealId)!; const x = mealMacros(m, pm.scale);
    const per100 = { kcal: x.kcal * 100 / x.grams, protein: x.protein * 100 / x.grams, carbs: x.carbs * 100 / x.grams, fat: x.fat * 100 / x.grams, fiber: x.fiberG * 100 / x.grams, sugar: null, sodiumMg: null };
    const date = toISO(addDays(parseISO(plan.weekStart), day)) <= todayISO() ? toISO(addDays(parseISO(plan.weekStart), day)) : todayISO();
    update((d) => {
      d.foodLogs.push({ id: uid(), date, meal: pm.slot as Meal, foodId: `meal-${m.id}`, name: m.name, servingLabel: `1 meal (${x.grams} g)`, grams: x.grams, quantity: 1,
        per100g: per100, totals: scale(per100, x.grams), createdAt: new Date().toISOString() });
      return d;
    });
    setLogged((s) => new Set(s).add(`${day}-${k}`));
  };

  return (
    <div className="space-y-4">
      {stale && (
        <Panel tone="sun"><p className="text-sm">Your targets changed since this plan was made.</p>
          <Btn className="mt-2 w-full" onClick={regenerate}><RefreshCw size={16} />Rebuild for new targets</Btn></Panel>
      )}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Day">
        {plan.days.map((_, i) => {
          const date = toISO(addDays(parseISO(plan.weekStart), i));
          return (
            <button key={i} role="tab" aria-selected={day === i} onClick={() => { setDay(i); setOpen(null); }}
              className={cx('flex min-h-[52px] min-w-[52px] shrink-0 flex-col items-center justify-center rounded-xl border px-2', day === i ? 'border-sun bg-sun text-ink' : 'border-rim text-chalk', date === todayISO() && day !== i && 'ring-1 ring-sun')}>
              <span className="text-xs font-semibold">{DAY_NAMES[i].slice(0, 3)}</span><span className="text-[11px] opacity-70">{fmtShort(date).split(', ')[1] ?? ''}</span>
            </button>
          );
        })}
      </div>

      <Panel tone="sun">
        <div className="grid gap-2">
          <Bar label="Calories" v={t.kcal} t={plan.targets.kcal} color="#F4B740" unit="" />
          <Bar label="Protein" v={t.protein} t={plan.targets.protein} color="#67C6B3" />
          <Bar label="Carbs" v={t.carbs} t={plan.targets.carbs} color="#F4B740" />
          <Bar label="Fat" v={t.fat} t={plan.targets.fat} color="#93A1B5" />
          <Bar label="Fiber" v={t.fiber} t={30} color="#67C6B3" />
        </div>
      </Panel>

      {plan.days[day].meals.map((pm, k) => {
        const m = mealById(pm.mealId); if (!m) return null;
        const x = mealMacros(m, pm.scale);
        const isOpen = open === k; const done = logged.has(`${day}-${k}`);
        return (
          <Panel key={`${day}-${k}-${pm.mealId}`}>
            <button className="w-full text-left" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
              <div className="flex items-center gap-2">
                <span className="text-sm text-sun">{SLOT_LABEL[pm.slot]}</span>
                {pm.extra && <Badge tone="tide">Protein top-up</Badge>}
                {pm.scale !== 1 && <span className="text-xs text-haze">{pm.scale}× portion</span>}
              </div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-2xl font-semibold leading-tight">{m.name}</p>
                <ChevronDown size={20} className={cx('mt-1 shrink-0 text-haze transition-transform', isOpen && 'rotate-180')} />
              </div>
              <p className="mt-1 text-sm"><span className="font-display text-lg">{x.kcal}</span> kcal · <span className="text-tide">{Math.round(x.protein)}g P</span> · {Math.round(x.carbs)}g C · {Math.round(x.fat)}g F · {Math.round(x.fiberG)}g fiber</p>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-3 border-t border-rim pt-3">
                <ul className="space-y-1 text-sm">
                  {m.items.map(([key, g]) => <li key={key} className="flex justify-between gap-3"><span>{INGREDIENTS[key].name}</span><span className="shrink-0 text-haze">{amount(key, g * pm.scale)}</span></li>)}
                </ul>
                <ol className="list-decimal space-y-1 pl-5 text-sm">{m.steps.map((s2) => <li key={s2}>{s2}</li>)}</ol>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Btn variant={done ? 'ghost' : 'primary'} disabled={done} onClick={() => logMeal(k)}>{done ? <><Check size={16} />Logged</> : 'Log it'}</Btn>
              <Btn variant="ghost" onClick={() => swap(k)}><Shuffle size={16} />Swap</Btn>
            </div>
          </Panel>
        );
      })}

      <div className="grid grid-cols-3 gap-2">
        <Btn variant="ghost" onClick={() => setShop(true)}><ShoppingCart size={16} />Groceries</Btn>
        <Btn variant="ghost" onClick={() => { if (confirm('Build a fresh 7-day plan? This replaces the current one.')) regenerate(); }}><RefreshCw size={16} />New plan</Btn>
        <Btn variant="ghost" onClick={onEdit}><SlidersHorizontal size={16} />Prefs</Btn>
      </div>
      {shop && <Groceries plan={plan} onClose={() => setShop(false)} />}
    </div>
  );
}

function Groceries({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const [range, setRange] = useState<'week' | 'next3'>('week');
  const today = Math.max(0, Math.round((parseISO(todayISO()).getTime() - parseISO(plan.weekStart).getTime()) / 86_400_000));
  const days = range === 'week' ? undefined : [today, today + 1, today + 2].filter((d) => d < 7);
  const groups = useMemo(() => groceryList(plan, days), [plan, range]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Grocery list" onClick={onClose}>
      <div className="max-h-[92%] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-rim bg-deck p-5 pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl font-semibold">Grocery list</h2>
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>
        <Chips value={range} onChange={setRange} options={[{ value: 'week', label: 'Whole week' }, { value: 'next3', label: 'Next 3 days' }]} />
        {Object.entries(groups).filter(([, v]) => v.length).map(([aisle, items]) => (
          <div key={aisle} className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-haze">{aisle}</p>
            <ul className="divide-y divide-rim">
              {items.map((it) => (
                <li key={it.key}>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-3">
                    <input type="checkbox" className="h-5 w-5 accent-[#F4B740]" checked={checked.has(it.key)} onChange={() => setChecked((s) => { const n = new Set(s); n.has(it.key) ? n.delete(it.key) : n.add(it.key); return n; })} />
                    <span className={cx('flex-1', checked.has(it.key) && 'text-haze line-through')}>{it.name}</span>
                    <span className="text-sm text-haze">{it.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-4 text-xs text-haze">Meat and fish amounts are raw weights; rice, pasta and grains are cooked weights.</p>
      </div>
    </div>
  );
}
