import { useCallback, useEffect, useMemo, useState } from 'react';
import { Barcode, ChevronLeft, Plus, Search, Star, Trash2, X, Zap } from 'lucide-react';
import { useStore } from '../store';
import type { Food, FoodLogEntry, Macros, Meal } from '../types';
import { MEALS, foodApi, recentFoods, scale, type FoodResult } from '../lib/nutrition';
import { uid } from '../lib/date';
import { BarcodeScanner } from './BarcodeScanner';
import { Btn, Chips, Stepper, cx } from './ui';

type Tab = 'search' | 'recent' | 'mine' | 'scan' | 'quick' | 'create';
type Picked = { food: Pick<Food, 'id' | 'name' | 'brand' | 'per100g' | 'servings' | 'source' | 'barcode'>; entry?: FoodLogEntry };

const field = 'min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun';
const kcalLine = (m: Macros) => `${m.kcal} kcal · P ${m.protein} · C ${m.carbs} · F ${m.fat}`;

export function AddFoodSheet({ date, meal: initialMeal, edit, onClose }: { date: string; meal: Meal; edit?: FoodLogEntry; onClose: () => void }) {
  const { data } = useStore();
  const [tab, setTab] = useState<Tab>('search');
  const savedFood = edit?.foodId ? data.foods.find((f) => f.id === edit.foodId) : undefined;
  const [picked, setPicked] = useState<Picked | null>(edit ? {
    food: { id: edit.foodId ?? 'quick', name: edit.name, brand: edit.brand, per100g: edit.per100g, source: 'custom',
      servings: savedFood?.servings ?? (edit.servingLabel === 'g' ? [{ label: '100 g', grams: 100 }] : [{ label: edit.servingLabel, grams: edit.grams }]) }, entry: edit,
  } : null);
  const [meal, setMeal] = useState<Meal>(edit?.meal ?? initialMeal);

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add food" onClick={onClose}>
      <div className="flex max-h-[94%] w-full max-w-xl flex-col rounded-t-3xl border border-rim bg-deck pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 pt-4">
          {picked && !edit ? (
            <button onClick={() => setPicked(null)} className="flex min-h-[44px] items-center gap-1 text-haze"><ChevronLeft size={18} />Back</button>
          ) : <h2 className="font-display text-2xl font-semibold">{edit ? 'Edit food' : 'Add food'}</h2>}
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>
        <div className="px-5 pb-2">
          <Chips value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.id, label: m.label }))} />
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {picked ? (
            <Portion picked={picked} date={date} meal={meal} onDone={onClose} />
          ) : (
            <>
              <div className="-mx-5 mb-3 flex gap-1 overflow-x-auto border-b border-rim px-5" role="tablist">
                {([['search', 'Search'], ['recent', 'Recent'], ['mine', 'My foods'], ['scan', 'Scan'], ['quick', 'Quick add'], ['create', 'Create']] as [Tab, string][]).map(([t, l]) => (
                  <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                    className={cx('min-h-[44px] shrink-0 border-b-2 px-3 text-sm font-semibold', tab === t ? 'border-sun text-chalk' : 'border-transparent text-haze')}>{l}</button>
                ))}
              </div>
              {tab === 'search' && <SearchTab onPick={(f) => setPicked({ food: f })} />}
              {tab === 'recent' && <RecentTab onPick={setPicked} />}
              {tab === 'mine' && <MineTab onPick={(f) => setPicked({ food: f })} goCreate={() => setTab('create')} />}
              {tab === 'scan' && <ScanTab onPick={(f) => setPicked({ food: f })} goCreate={() => setTab('create')} />}
              {tab === 'quick' && <QuickAdd date={date} meal={meal} onDone={onClose} />}
              {tab === 'create' && <CreateFood onCreated={(f) => setPicked({ food: f })} />}
              {data.foodLogs.length === 0 && tab === 'search' && <p className="mt-4 text-xs text-haze">Tip: search simple words like “banana” or “chicken breast”. Brands show up in their own list.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function FoodRow({ name, brand, sub, onClick }: { name: string; brand?: string; sub: string; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} className="flex min-h-[56px] w-full flex-col justify-center py-2 text-left active:bg-rim/50">
        <span className="font-semibold leading-tight">{name}</span>
        <span className="text-sm text-haze">{brand ? `${brand} · ` : ''}{sub}</span>
      </button>
    </li>
  );
}

function SearchTab({ onPick }: { onPick: (f: FoodResult) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<{ generic: FoodResult[]; branded: FoodResult[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setRes(null); return; }
    const t = setTimeout(async () => {
      setBusy(true); setErr(null);
      try { setRes(await foodApi.search(term)); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);
  const per = (f: FoodResult) => `${f.per100g.kcal} kcal per 100 g`;
  return (
    <div>
      <label className="relative block">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haze" />
        <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search foods" aria-label="Search foods" className={`${field} pl-10`} />
      </label>
      {busy && <p className="mt-3 text-sm text-haze" role="status">Searching…</p>}
      {err && <p className="mt-3 text-sm text-flare" role="alert">{err}</p>}
      {res && !busy && (
        <>
          {res.generic.length > 0 && <><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-haze">Common foods</p>
            <ul className="divide-y divide-rim">{res.generic.map((f) => <FoodRow key={f.id} name={f.name} sub={per(f)} onClick={() => onPick(f)} />)}</ul></>}
          {res.branded.length > 0 && <><p className="mt-4 text-xs font-semibold uppercase tracking-wide text-haze">Brands</p>
            <ul className="divide-y divide-rim">{res.branded.map((f) => <FoodRow key={f.id} name={f.name} brand={f.brand} sub={f.servings[0] && f.servings[0].grams !== 100 ? `${Math.round(f.per100g.kcal * f.servings[0].grams / 100)} kcal per ${f.servings[0].label}` : per(f)} onClick={() => onPick(f)} />)}</ul></>}
          {!res.generic.length && !res.branded.length && <p className="mt-3 text-sm text-haze">No matches. Try fewer words, or create it yourself.</p>}
        </>
      )}
    </div>
  );
}

function RecentTab({ onPick }: { onPick: (p: Picked) => void }) {
  const { data } = useStore();
  const list = recentFoods(data);
  if (!list.length) return <p className="text-sm text-haze">Foods you log show up here for one-tap re-adding.</p>;
  return (
    <ul className="divide-y divide-rim">
      {list.map((l) => (
        <FoodRow key={l.id} name={l.name} brand={l.brand} sub={`${l.quantity !== 1 ? `${l.quantity} × ` : ''}${l.servingLabel} · ${l.totals.kcal} kcal`}
          onClick={() => onPick({ food: { id: l.foodId ?? 'quick', name: l.name, brand: l.brand, per100g: l.per100g, servings: [{ label: l.servingLabel, grams: l.grams }, { label: '100 g', grams: 100 }], source: 'custom' },
            entry: { ...l, id: '', quantity: l.quantity } })} />
      ))}
    </ul>
  );
}

function MineTab({ onPick, goCreate }: { onPick: (f: Food) => void; goCreate: () => void }) {
  const { data } = useStore();
  const list = data.foods.filter((f) => f.favorite || f.source === 'custom').sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      {list.length === 0 ? <p className="text-sm text-haze">Star foods to keep them here, or create your own.</p>
        : <ul className="divide-y divide-rim">{list.map((f) => <FoodRow key={f.id} name={f.name} brand={f.brand} sub={f.recipe ? `Recipe · ${f.recipe.perServing.kcal} kcal per serving` : `${f.per100g.kcal} kcal per 100 g`} onClick={() => onPick(f)} />)}</ul>}
      <Btn variant="ghost" className="mt-3 w-full" onClick={goCreate}><Plus size={16} />Create a food</Btn>
    </div>
  );
}

function ScanTab({ onPick, goCreate }: { onPick: (f: FoodResult) => void; goCreate: () => void }) {
  const [state, setState] = useState<{ code: string; busy: boolean; missing?: boolean; err?: string } | null>(null);
  const onCode = useCallback(async (code: string) => {
    setState({ code, busy: true });
    try {
      const { food } = await foodApi.barcode(code);
      if (food) onPick(food); else setState({ code, busy: false, missing: true });
    } catch (e: any) { setState({ code, busy: false, err: e.message }); }
  }, [onPick]);
  if (state?.busy) return <p className="text-haze" role="status">Looking up {state.code}…</p>;
  return (
    <div className="space-y-3">
      {state?.missing && (
        <div className="rounded-xl border border-rim p-3 text-sm">
          <p>Couldn’t find {state.code}. You can add it from the label.</p>
          <Btn variant="ghost" className="mt-2" onClick={goCreate}><Plus size={16} />Create from label</Btn>
        </div>
      )}
      {state?.err && <p className="text-sm text-flare" role="alert">{state.err}</p>}
      {!state?.missing && <BarcodeScanner onCode={onCode} />}
      {state?.missing && <Btn variant="quiet" onClick={() => setState(null)}><Barcode size={16} />Scan another</Btn>}
      <p className="text-xs text-haze">Barcode data from USDA FoodData Central and Open Food Facts (openfoodfacts.org, ODbL).</p>
    </div>
  );
}

function QuickAdd({ date, meal, onDone }: { date: string; meal: Meal; onDone: () => void }) {
  const { update } = useStore();
  const [name, setName] = useState('');
  const [v, setV] = useState({ kcal: '', protein: '', carbs: '', fat: '' });
  const n = (s: string) => (s === '' ? 0 : Math.max(0, Number(s)));
  const totals: Macros = { kcal: Math.round(n(v.kcal) || n(v.protein) * 4 + n(v.carbs) * 4 + n(v.fat) * 9), protein: n(v.protein), carbs: n(v.carbs), fat: n(v.fat), fiber: null, sugar: null, sodiumMg: null };
  const save = () => {
    update((d) => {
      d.foodLogs.push({ id: uid(), date, meal, foodId: null, name: name.trim() || 'Quick add', servingLabel: 'quick add', grams: 100, quantity: 1, per100g: totals, totals, createdAt: new Date().toISOString() });
      return d;
    });
    onDone();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-haze">For restaurant meals or when you only know the numbers.</p>
      <label className="block"><span className="mb-1 block text-sm text-haze">What was it? (optional)</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Burrito bowl" /></label>
      <div className="grid grid-cols-2 gap-2">
        {([['kcal', 'Calories'], ['protein', 'Protein (g)'], ['carbs', 'Carbs (g)'], ['fat', 'Fat (g)']] as const).map(([k, l]) => (
          <label key={k}><span className="mb-1 block text-sm text-haze">{l}</span>
            <input inputMode="decimal" type="number" min={0} className={field} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
        ))}
      </div>
      {!v.kcal && (v.protein || v.carbs || v.fat) && <p className="text-xs text-haze">Calories estimated from macros: {totals.kcal} kcal.</p>}
      <Btn size="lg" className="w-full" disabled={!totals.kcal} onClick={save}><Zap size={18} />Add {totals.kcal || ''} kcal</Btn>
    </div>
  );
}

function CreateFood({ onCreated }: { onCreated: (f: Food) => void }) {
  const { update } = useStore();
  const [f, setF] = useState({ name: '', brand: '', serving: '1 serving', grams: '', kcal: '', protein: '', carbs: '', fat: '' });
  const n = (s: string) => (s === '' ? 0 : Math.max(0, Number(s)));
  const grams = n(f.grams);
  const ok = f.name.trim() && grams > 0 && f.kcal !== '';
  const save = () => {
    const k = 100 / grams;
    const food: Food = {
      id: `custom-${uid()}`, name: f.name.trim(), brand: f.brand.trim() || undefined, source: 'custom', favorite: true,
      per100g: { kcal: Math.round(n(f.kcal) * k), protein: Math.round(n(f.protein) * k * 10) / 10, carbs: Math.round(n(f.carbs) * k * 10) / 10, fat: Math.round(n(f.fat) * k * 10) / 10, fiber: null, sugar: null, sodiumMg: null },
      servings: [{ label: `${f.serving.trim() || '1 serving'} (${grams} g)`, grams }, { label: '100 g', grams: 100 }],
    };
    update((d) => { d.foods.push(food); return d; });
    onCreated(food);
  };
  const inp = (k: keyof typeof f, label: string, numeric = false, placeholder = '') => (
    <label><span className="mb-1 block text-sm text-haze">{label}</span>
      <input className={field} inputMode={numeric ? 'decimal' : undefined} type={numeric ? 'number' : 'text'} value={f[k]} placeholder={placeholder} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-haze">Copy the numbers from the nutrition label, per serving.</p>
      {inp('name', 'Name', false, 'e.g. Mom’s pho')}
      {inp('brand', 'Brand (optional)')}
      <div className="grid grid-cols-2 gap-2">{inp('serving', 'Serving', false, '1 bowl')}{inp('grams', 'Serving weight (g)', true)}</div>
      <div className="grid grid-cols-2 gap-2">{inp('kcal', 'Calories', true)}{inp('protein', 'Protein (g)', true)}{inp('carbs', 'Carbs (g)', true)}{inp('fat', 'Fat (g)', true)}</div>
      <Btn size="lg" className="w-full" disabled={!ok} onClick={save}>Save food</Btn>
    </div>
  );
}

function Portion({ picked, date, meal, onDone }: { picked: Picked; date: string; meal: Meal; onDone: () => void }) {
  const { data, update } = useStore();
  const { food, entry } = picked;
  const servings = food.servings.length ? food.servings : [{ label: '100 g', grams: 100 }];
  const byGrams = entry?.servingLabel === 'g';
  const startIdx = byGrams ? -1 : entry ? Math.max(0, servings.findIndex((s) => s.label === entry.servingLabel)) : 0;
  const [idx, setIdx] = useState<number>(startIdx);
  const [custom, setCustom] = useState<number | null>(byGrams ? entry!.quantity : null);
  const [qty, setQty] = useState<number | null>(byGrams ? 1 : entry?.quantity ?? 1);
  const grams = idx === -1 ? custom ?? 0 : servings[idx].grams;
  const label = idx === -1 ? `${custom ?? 0} g` : servings[idx].label;
  const totals = useMemo(() => scale(food.per100g, grams * (qty ?? 0)), [food.per100g, grams, qty]);
  const saved = data.foods.find((f) => f.id === food.id);
  const isEdit = !!entry?.id;

  const commit = () => {
    update((d) => {
      const e: FoodLogEntry = {
        id: isEdit ? entry!.id : uid(), date: isEdit ? entry!.date : date, meal, foodId: food.id === 'quick' ? null : food.id,
        name: food.name, brand: food.brand, servingLabel: idx === -1 ? 'g' : label, grams: idx === -1 ? 1 : grams,
        quantity: idx === -1 ? custom ?? 0 : qty ?? 0, per100g: food.per100g, totals, createdAt: isEdit ? entry!.createdAt : new Date().toISOString(),
      };
      if (idx === -1) e.totals = scale(food.per100g, custom ?? 0);
      if (isEdit) d.foodLogs = d.foodLogs.map((x) => (x.id === e.id ? e : x)); else d.foodLogs.push(e);
      if (food.id !== 'quick' && !food.id.startsWith('custom-') && !food.id.startsWith('sp-')) {
        const ex = d.foods.find((x) => x.id === food.id);
        if (ex) ex.lastUsed = e.createdAt;
        else d.foods.push({ ...food, source: food.source === 'off' ? 'off' : 'usda', lastUsed: e.createdAt } as Food);
      }
      return d;
    });
    onDone();
  };
  const toggleStar = () => update((d) => {
    const ex = d.foods.find((x) => x.id === food.id);
    if (ex) ex.favorite = !ex.favorite; else d.foods.push({ ...food, favorite: true } as Food);
    return d;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-3xl font-semibold leading-tight">{food.name}</h3>
          {food.brand && <p className="text-haze">{food.brand}</p>}
        </div>
        {food.id !== 'quick' && (
          <button aria-label={saved?.favorite ? 'Remove from My foods' : 'Save to My foods'} aria-pressed={!!saved?.favorite} onClick={toggleStar}
            className={cx('grid h-11 w-11 shrink-0 place-items-center rounded-xl', saved?.favorite ? 'text-sun' : 'text-haze')}><Star size={22} fill={saved?.favorite ? 'currentColor' : 'none'} /></button>
        )}
      </div>

      <div className="rounded-2xl bg-ink p-4 text-center">
        <p className="font-display text-6xl font-bold leading-none">{idx === -1 ? scale(food.per100g, custom ?? 0).kcal : totals.kcal}<span className="ml-1 text-xl text-haze">kcal</span></p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
          {(['protein', 'carbs', 'fat'] as const).map((k) => {
            const t = idx === -1 ? scale(food.per100g, custom ?? 0) : totals;
            return <div key={k}><p className="font-display text-2xl">{t[k]}g</p><p className="text-haze">{k === 'protein' ? 'Protein' : k === 'carbs' ? 'Carbs' : 'Fat'}</p></div>;
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm text-haze">Serving</p>
        <div className="flex flex-wrap gap-2">
          {servings.map((s, i) => (
            <button key={s.label} aria-pressed={idx === i} onClick={() => setIdx(i)}
              className={cx('min-h-[40px] rounded-full border px-3 text-sm', idx === i ? 'border-sun bg-sun font-semibold text-ink' : 'border-rim text-chalk')}>{s.label}</button>
          ))}
          <button aria-pressed={idx === -1} onClick={() => { setIdx(-1); setCustom(custom ?? Math.round(grams * (qty ?? 1))); }}
            className={cx('min-h-[40px] rounded-full border px-3 text-sm', idx === -1 ? 'border-sun bg-sun font-semibold text-ink' : 'border-rim text-chalk')}>Grams</button>
        </div>
      </div>
      {idx === -1
        ? <Stepper label="Amount" suffix="grams" step={10} decimals={false} value={custom} onChange={setCustom} />
        : <Stepper label="Servings" step={0.5} value={qty} onChange={setQty} />}

      <Btn size="lg" className="w-full" disabled={idx === -1 ? !custom : !qty} onClick={commit}>
        {isEdit ? 'Save changes' : `Add to ${MEALS.find((m) => m.id === meal)!.label}`}
      </Btn>
      {isEdit && (
        <Btn variant="ghost" className="w-full" onClick={() => { if (confirm('Remove this food from your log?')) { update((d) => { d.foodLogs = d.foodLogs.filter((x) => x.id !== entry!.id); return d; }); onDone(); } }}>
          <Trash2 size={16} />Remove from log
        </Btn>
      )}
      <p className="text-xs text-haze">{food.per100g.kcal} kcal per 100 g · {food.source === 'off' ? 'Open Food Facts (ODbL)' : food.source === 'usda' ? 'USDA FoodData Central' : food.source === 'recipe' ? 'Recipe from Spoonacular' : 'Your food'}</p>
    </div>
  );
}

export { kcalLine };
