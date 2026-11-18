import { useState } from 'react';
import { Bookmark, ChevronLeft, Clock, ExternalLink, Search, Users, X } from 'lucide-react';
import { useStore } from '../store';
import type { Meal } from '../types';
import { CUISINE_OPTIONS, GOAL_INFO, PROTEIN_OPTIONS, foodToRecipe, recipeToFood, searchRecipes, type Goal, type Recipe } from '../lib/recipes';
import { MEALS, scale } from '../lib/nutrition';
import { todayISO, uid } from '../lib/date';
import { Btn, Chips, Panel, Screen, Stepper, cx } from '../components/ui';

export default function Recipes() {
  const { data, go } = useStore();
  const [goal, setGoal] = useState<Goal>('protein');
  const [protein, setProtein] = useState('chicken');
  const [cuisine, setCuisine] = useState('');
  const [maxKcal, setMaxKcal] = useState(0);
  const [type, setType] = useState('main course');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Recipe[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<Recipe | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const saved = data.foods.filter((f) => f.source === 'recipe' && f.favorite).map(foodToRecipe).filter(Boolean) as Recipe[];

  const run = async (offset = 0) => {
    setBusy(true); setErr(null); setShowSaved(false);
    try {
      const r = await searchRecipes({ goal, protein, cuisine, maxKcal, type, q, offset });
      setResults(offset ? [...(results ?? []), ...r.recipes] : r.recipes); setTotal(r.total);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  const list = showSaved ? saved : results;
  const pill = (active: boolean) => cx('min-h-[40px] shrink-0 rounded-full border px-3 text-sm', active ? 'border-sun bg-sun font-semibold text-ink' : 'border-rim text-chalk');

  return (
    <Screen title="Find recipes" sub="Meals built around your macros" right={<Btn variant="ghost" onClick={() => go('food')}><ChevronLeft size={18} />Back</Btn>}>
      <Panel>
        <p className="mb-2 text-sm text-haze">Goal</p>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(GOAL_INFO) as Goal[]).map((g) => (
            <button key={g} aria-pressed={goal === g} onClick={() => setGoal(g)}
              className={cx('rounded-xl border p-3 text-left', goal === g ? 'border-sun bg-sun/10' : 'border-rim')}>
              <span className={cx('block font-display text-lg font-semibold', goal === g && 'text-sun')}>{GOAL_INFO[g].label}</span>
              <span className="block text-xs text-haze">{GOAL_INFO[g].hint}</span>
            </button>
          ))}
        </div>
        <p className="mb-2 mt-4 text-sm text-haze">Protein</p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {PROTEIN_OPTIONS.map((p) => <button key={p.id} aria-pressed={protein === p.id} onClick={() => setProtein(p.id)} className={pill(protein === p.id)}>{p.label}</button>)}
        </div>
        <p className="mb-2 mt-4 text-sm text-haze">Cuisine</p>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {CUISINE_OPTIONS.map((c) => <button key={c.id} aria-pressed={cuisine === c.id} onClick={() => setCuisine(c.id)} className={pill(cuisine === c.id)}>{c.label}</button>)}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Meal type" className="min-h-[44px] rounded-xl border border-rim bg-ink px-2 text-chalk">
            <option value="main course">Main meals</option><option value="breakfast">Breakfast</option><option value="salad">Salads</option><option value="soup">Soups</option><option value="snack">Snacks</option>
          </select>
          <select value={maxKcal} onChange={(e) => setMaxKcal(Number(e.target.value))} aria-label="Calories per serving" className="min-h-[44px] rounded-xl border border-rim bg-ink px-2 text-chalk">
            <option value={0}>Any calories</option><option value={400}>Under 400 kcal</option><option value={600}>Under 600 kcal</option><option value={800}>Under 800 kcal</option><option value={1000}>Under 1,000 kcal</option>
          </select>
        </div>
        <label className="relative mt-2 block">
          <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haze" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} placeholder="Optional: tacos, stir fry, pasta…" aria-label="Recipe keywords"
            className="min-h-[48px] w-full rounded-xl border border-rim bg-ink pl-10 pr-3 text-chalk outline-none focus:border-sun" />
        </label>
        <Btn size="lg" className="mt-3 w-full" disabled={busy} onClick={() => run()}>{busy && !results?.length ? 'Searching…' : 'Find recipes'}</Btn>
      </Panel>

      {saved.length > 0 && (
        <Btn variant="ghost" className="w-full" onClick={() => setShowSaved((v) => !v)}><Bookmark size={16} />{showSaved ? 'Back to search results' : `My saved recipes (${saved.length})`}</Btn>
      )}
      {err && <p className="text-sm text-flare" role="alert">{err}</p>}
      {list && list.length === 0 && !busy && <p className="text-center text-haze">{showSaved ? 'No saved recipes yet.' : cuisine ? `No ${CUISINE_OPTIONS.find((c) => c.id === cuisine)?.label} recipes match all of that. Try Protein: Any, the Balanced goal, or a higher calorie limit. Cuisine collections are smaller.` : 'No recipes match. Try another protein, a higher calorie limit, or a different goal.'}</p>}

      <ul className="space-y-3">
        {list?.map((r) => (
          <li key={r.id}>
            <button onClick={() => setOpen(r)} className="w-full overflow-hidden rounded-2xl border border-rim bg-deck text-left active:bg-rim/60">
              {r.image && <img src={r.image} alt="" loading="lazy" className="aspect-[16/9] w-full object-cover" />}
              <div className="p-4">
                <p className="font-display text-xl font-semibold leading-tight">{r.title}</p>
                <MacroRow r={r} />
                <p className="mt-1 flex gap-3 text-xs text-haze">
                  {r.readyInMinutes && <span className="flex items-center gap-1"><Clock size={12} />{r.readyInMinutes} min</span>}
                  <span className="flex items-center gap-1"><Users size={12} />{r.servings} servings</span>
                </p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {!showSaved && results && results.length < total && results.length < 60 && (
        <Btn variant="ghost" className="w-full" disabled={busy} onClick={() => run(results.length)}>{busy ? 'Loading…' : 'More recipes'}</Btn>
      )}
      <p className="px-1 text-xs text-haze">Recipes and nutrition <a href="https://spoonacular.com/food-api" target="_blank" rel="noreferrer" className="underline underline-offset-2">powered by Spoonacular</a>. Nutrition is estimated per serving.</p>
      {open && <RecipeSheet r={open} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

function MacroRow({ r }: { r: Recipe }) {
  const p = r.perServing;
  return (
    <div className="mt-2 grid grid-cols-4 gap-2 text-center">
      {[['kcal', p.kcal, ''], ['protein', p.protein, 'g'], ['carbs', p.carbs, 'g'], ['fat', p.fat, 'g']].map(([k, v, u]) => (
        <div key={k as string} className="rounded-lg bg-ink py-1.5">
          <p className={cx('font-display text-lg leading-none', k === 'protein' && 'text-tide', k === 'carbs' && 'text-sun')}>{Math.round(v as number)}{u}</p>
          <p className="text-[11px] text-haze">{k === 'kcal' ? 'kcal' : k}</p>
        </div>
      ))}
    </div>
  );
}

function RecipeSheet({ r, onClose }: { r: Recipe; onClose: () => void }) {
  const { data, update, go } = useStore();
  const [meal, setMeal] = useState<Meal>('dinner');
  const [qty, setQty] = useState<number | null>(1);
  const [done, setDone] = useState(false);
  const isSaved = data.foods.some((f) => f.id === r.id && f.favorite);
  const food = recipeToFood(r);

  const save = () => update((d) => {
    const ex = d.foods.find((f) => f.id === r.id);
    if (ex) ex.favorite = !ex.favorite; else d.foods.push(food);
    return d;
  });
  const log = () => {
    update((d) => {
      const grams = food.servings[0].grams;
      const now = new Date().toISOString();
      d.foodLogs.push({ id: uid(), date: todayISO(), meal, foodId: food.id, name: food.name, servingLabel: food.servings[0].label, grams,
        quantity: qty ?? 1, per100g: food.per100g, totals: scale(food.per100g, grams * (qty ?? 1)), createdAt: now });
      const ex = d.foods.find((f) => f.id === food.id);
      if (ex) ex.lastUsed = now; else d.foods.push({ ...food, favorite: false, lastUsed: now });
      return d;
    });
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={r.title} onClick={onClose}>
      <div className="max-h-[94%] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-rim bg-deck pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {r.image && <img src={r.image} alt="" className="aspect-[16/9] w-full rounded-t-3xl object-cover" />}
          <button aria-label="Close" onClick={onClose} className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-xl bg-ink/80 text-chalk"><X size={20} /></button>
        </div>
        <div className="space-y-4 p-5">
          <div>
            <h2 className="font-display text-3xl font-bold leading-tight">{r.title}</h2>
            <p className="mt-1 flex gap-3 text-sm text-haze">
              {r.readyInMinutes && <span className="flex items-center gap-1"><Clock size={14} />{r.readyInMinutes} min</span>}
              <span className="flex items-center gap-1"><Users size={14} />Makes {r.servings}</span>
            </p>
            <p className="mt-2 text-sm text-haze">Per serving</p>
            <MacroRow r={r} />
          </div>

          <div className="rounded-2xl border border-sun/40 p-4">
            {done ? (
              <div className="space-y-2">
                <p className="text-tide">Logged to {MEALS.find((m) => m.id === meal)!.label.toLowerCase()} today.</p>
                <Btn variant="ghost" className="w-full" onClick={() => { onClose(); go('food'); }}>See today’s food</Btn>
              </div>
            ) : (
              <>
                <Chips value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.id, label: m.label }))} />
                <div className="mt-3"><Stepper label="Servings eaten" step={0.5} value={qty} onChange={setQty} /></div>
                <Btn size="lg" className="mt-3 w-full" disabled={!qty} onClick={log}>Log {qty ?? 0} serving{qty === 1 ? '' : 's'} · {Math.round(r.perServing.kcal * (qty ?? 0))} kcal</Btn>
              </>
            )}
            <Btn variant="ghost" className="mt-2 w-full" onClick={save}><Bookmark size={16} fill={isSaved ? 'currentColor' : 'none'} />{isSaved ? 'Saved to My foods' : 'Save recipe'}</Btn>
          </div>

          {r.ingredients.length > 0 && (
            <div>
              <h3 className="font-display text-xl font-semibold">Ingredients</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5">{r.ingredients.map((i, k) => <li key={k}>{i}</li>)}</ul>
            </div>
          )}
          {r.steps.length > 0 && (
            <div>
              <h3 className="font-display text-xl font-semibold">Steps</h3>
              <ol className="mt-2 list-decimal space-y-2 pl-5">{r.steps.map((st, k) => <li key={k}>{st}</li>)}</ol>
            </div>
          )}
          {r.sourceUrl && <a href={r.sourceUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-sm text-sun underline underline-offset-4"><ExternalLink size={14} />Original recipe</a>}
        </div>
      </div>
    </div>
  );
}
