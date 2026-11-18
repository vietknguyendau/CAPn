import { useState } from 'react';
import { CalendarRange, ChefHat, ChevronLeft, ChevronRight, Copy, Flame, Plus, Settings2 } from 'lucide-react';
import { useStore } from '../store';
import type { FoodLogEntry, Meal } from '../types';
import { MEALS, logsOn, nutritionOf, sum } from '../lib/nutrition';
import { addDays, fmtLong, parseISO, toISO, todayISO, uid } from '../lib/date';
import { AddFoodSheet } from '../components/AddFoodSheet';
import { energyOn, recentBalance } from '../lib/energy';
import { TargetsSheet } from '../components/TargetsSheet';
import { Btn, Panel, Screen, cx } from '../components/ui';

function Bar({ label, value, target, unit, color }: { label: string; value: number; target: number | null; unit: string; color: string }) {
  const pct = target ? Math.min(100, (value / target) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-haze">{label}</span>
        <span><span className="font-display text-lg">{Math.round(value)}</span>{target ? <span className="text-haze"> / {target}{unit}</span> : <span className="text-haze">{unit}</span>}</span>
      </div>
      {target ? <div className="mt-1 h-2 overflow-hidden rounded-full bg-rim"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} /></div> : null}
    </div>
  );
}

export default function Food() {
  const { data, update, go } = useStore();
  const [date, setDate] = useState(todayISO());
  const [adding, setAdding] = useState<Meal | null>(null);
  const [editing, setEditing] = useState<FoodLogEntry | null>(null);
  const [targets, setTargets] = useState(false);
  const n = nutritionOf(data);
  const day = logsOn(data, date);
  const total = sum(day);
  const yesterday = toISO(addDays(parseISO(date), -1));
  const t = n.targets;
  const left = t.kcal != null ? t.kcal - total.kcal : null;
  const isToday = date === todayISO();

  const copyYesterday = (meal: Meal) => update((d) => {
    const now = new Date().toISOString();
    d.foodLogs.push(...d.foodLogs.filter((l) => l.date === yesterday && l.meal === meal).map((l) => ({ ...l, id: uid(), date, createdAt: now })));
    return d;
  });

  return (
    <Screen title="Food" sub={isToday ? 'Today' : fmtLong(date)}
      right={<button onClick={() => setTargets(true)} aria-label="Daily targets" className="grid h-11 w-11 place-items-center rounded-xl border border-rim text-haze active:bg-rim"><Settings2 size={20} /></button>}>
      <div className="flex items-center justify-between">
        <button aria-label="Previous day" onClick={() => setDate(yesterday)} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><ChevronLeft /></button>
        <button onClick={() => setDate(todayISO())} className="min-h-[44px] font-semibold">{fmtLong(date)}</button>
        <button aria-label="Next day" disabled={isToday} onClick={() => setDate(toISO(addDays(parseISO(date), 1)))} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim disabled:opacity-30"><ChevronRight /></button>
      </div>

      <Panel tone="sun">
        {n.showCalories && (
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm text-haze">Eaten</p>
              <p className="font-display text-6xl font-bold leading-none">{total.kcal.toLocaleString()}<span className="ml-1 text-xl font-semibold text-haze">kcal</span></p>
            </div>
            {left != null && (
              <div className="text-right">
                <p className="font-display text-3xl font-semibold leading-none">{Math.abs(left).toLocaleString()}</p>
                <p className="text-sm text-haze">{left >= 0 ? 'left' : 'over target'}</p>
              </div>
            )}
          </div>
        )}
        {n.showCalories && t.kcal ? <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-rim"><div className="h-full rounded-full bg-sun" style={{ width: `${Math.min(100, (total.kcal / t.kcal) * 100)}%` }} /></div> : null}
        <div className={cx('grid gap-3', n.showCalories && 'mt-4')}>
          <Bar label="Protein" value={total.protein} target={t.protein} unit="g" color="#67C6B3" />
          <Bar label="Carbs" value={total.carbs} target={t.carbs} unit="g" color="#F4B740" />
          <Bar label="Fat" value={total.fat} target={t.fat} unit="g" color="#93A1B5" />
        </div>
        {!t.kcal && !t.protein && <button onClick={() => setTargets(true)} className="mt-3 min-h-[44px] text-sm text-sun underline underline-offset-4">Set daily targets (optional)</button>}
      </Panel>

      {n.showCalories && <EnergyPanel date={date} />}

      <button onClick={() => go('mealplan')} className="flex w-full items-center gap-4 rounded-2xl border border-sun/40 bg-sun/10 p-4 text-left active:bg-sun/20">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sun text-ink"><CalendarRange size={24} /></span>
        <span>
          <span className="block font-display text-2xl font-semibold leading-tight">Meal plan</span>
          <span className="block text-sm text-haze">{data.settings.mealPlan ? 'Your 7-day plan, groceries and one-tap logging' : 'A week of meals sized to your protein and calories'}</span>
        </span>
      </button>

      <button onClick={() => go('recipes')} className="flex w-full items-center gap-4 rounded-2xl border border-tide/40 bg-tide/10 p-4 text-left active:bg-tide/20">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-tide text-ink"><ChefHat size={24} /></span>
        <span>
          <span className="block font-display text-2xl font-semibold leading-tight">Find recipes</span>
          <span className="block text-sm text-haze">Protein heavy, carb loader, lean… with chicken, beef, pork and more</span>
        </span>
      </button>

      {MEALS.map((m) => {
        const items = day.filter((l) => l.meal === m.id);
        const mt = sum(items);
        const prev = data.foodLogs.some((l) => l.date === yesterday && l.meal === m.id);
        return (
          <Panel key={m.id}>
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="font-display text-xl font-semibold">{m.label}</h2>
              {items.length > 0 && <span className="text-sm text-haze">{n.showCalories ? `${mt.kcal} kcal · ` : ''}{Math.round(mt.protein)}g protein</span>}
            </div>
            {items.length > 0 && (
              <ul className="divide-y divide-rim">
                {items.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => setEditing(l)} className="flex min-h-[52px] w-full items-center justify-between gap-3 py-1.5 text-left active:bg-rim/50">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{l.name}</span>
                        <span className="block truncate text-sm text-haze">{l.brand ? `${l.brand} · ` : ''}{l.servingLabel === 'g' ? `${l.quantity} g` : `${l.quantity !== 1 ? `${l.quantity} × ` : ''}${l.servingLabel}`}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {n.showCalories && <span className="block font-display text-lg">{l.totals.kcal}</span>}
                        <span className="block text-xs text-haze">P {l.totals.protein} · C {l.totals.carbs} · F {l.totals.fat}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 flex gap-2">
              <Btn variant="ghost" className="flex-1" onClick={() => setAdding(m.id)}><Plus size={16} />Add food</Btn>
              {items.length === 0 && prev && <Btn variant="quiet" onClick={() => copyYesterday(m.id)}><Copy size={16} />Copy yesterday</Btn>}
            </div>
          </Panel>
        );
      })}

      {(total.fiber ?? 0) > 0 || (total.sodiumMg ?? 0) > 0 ? (
        <p className="px-1 text-sm text-haze">Also today: {total.fiber ? `${total.fiber} g fiber` : ''}{total.fiber && total.sodiumMg ? ' · ' : ''}{total.sodiumMg ? `${total.sodiumMg.toLocaleString()} mg sodium` : ''}</p>
      ) : null}
      <p className="px-1 text-xs text-haze">Food data from USDA FoodData Central. Some barcode results from Open Food Facts (ODbL). Numbers are estimates; labels and portions vary.</p>

      {adding && <AddFoodSheet date={date} meal={adding} onClose={() => setAdding(null)} />}
      {editing && <AddFoodSheet date={date} meal={editing.meal} edit={editing} onClose={() => setEditing(null)} />}
      {targets && <TargetsSheet onClose={() => setTargets(false)} />}
    </Screen>
  );
}

function EnergyPanel({ date }: { date: string }) {
  const { data } = useStore();
  const e = energyOn(data, date);
  const wk = recentBalance(data);
  if (e.burned == null && wk.full === 0) {
    if (!data.healthDays.length) return null;
    return <Panel><p className="text-sm text-haze">Calories burned for this day haven’t synced from Fitbit yet. Open the Fitbit app, then Settings → Fitbit → Sync now.</p></Panel>;
  }
  const isToday = date === todayISO();
  const net = e.net;
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
  return (
    <Panel tone="tide">
      <div className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-1.5 font-display text-xl font-semibold"><Flame size={18} className="text-tide" />In vs. out</h2>
        <span className="text-xs text-haze">burn from Fitbit</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-ink py-2"><p className="font-display text-2xl">{e.eaten.toLocaleString()}</p><p className="text-xs text-haze">eaten</p></div>
        <div className="rounded-xl bg-ink py-2"><p className="font-display text-2xl text-tide">{e.burned != null ? e.burned.toLocaleString() : '–'}</p><p className="text-xs text-haze">{isToday ? 'burned so far' : 'burned'}</p></div>
        <div className="rounded-xl bg-ink py-2">
          <p className={cx('font-display text-2xl', net != null && (net < 0 ? 'text-tide' : 'text-sun'))}>{net == null ? '–' : `${sign(net)}${Math.abs(net).toLocaleString()}`}</p>
          <p className="text-xs text-haze">{net == null ? 'balance' : net < 0 ? 'deficit' : 'surplus'}</p>
        </div>
      </div>
      {e.active != null && <p className="mt-2 text-xs text-haze">Includes {e.active.toLocaleString()} kcal from activity; the rest is your body’s resting burn.</p>}
      {isToday && e.burned != null && <p className="mt-1 text-xs text-haze">Today’s burn keeps rising until midnight, so today’s balance isn’t final.</p>}
      {!e.logged && e.burned != null && <p className="mt-1 text-xs text-haze">Log meals to see your balance for this day.</p>}
      {wk.avg != null && (
        <div className="mt-3 border-t border-rim pt-3">
          <p className="text-sm">Last {wk.full} complete day{wk.full > 1 ? 's' : ''}: average <span className={cx('font-display text-lg', wk.avg < 0 ? 'text-tide' : 'text-sun')}>{sign(wk.avg)}{Math.abs(wk.avg).toLocaleString()}</span> kcal a day
            {wk.weeklyLb != null && Math.abs(wk.weeklyLb) >= 0.1 ? `, roughly ${Math.abs(wk.weeklyLb)} lb a week ${wk.weeklyLb < 0 ? 'down' : 'up'} if it holds.` : '.'}</p>
          <div className="mt-2 flex h-14 items-center gap-1" role="img" aria-label="Daily balance, last 7 days">
            {wk.days.map((x) => {
              const v = x.net; const h = v == null ? 0 : Math.min(100, Math.abs(v) / 10);
              return (
                <div key={x.date} className="flex h-full flex-1 flex-col">
                  <div className="flex h-1/2 items-end">{v != null && v > 0 && <div className="w-full rounded-t bg-sun" style={{ height: `${h}%` }} />}</div>
                  <div className="h-px bg-rim" />
                  <div className="flex h-1/2 items-start">{v != null && v < 0 && <div className="w-full rounded-b bg-tide" style={{ height: `${h}%` }} />}</div>
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-haze">Up = ate more than burned, down = burned more. Blank days are missing food logs or Fitbit data.</p>
        </div>
      )}
      <p className="mt-2 text-xs text-haze">Trackers estimate burn and labels estimate food, so treat this as a trend, not an exact count. Your weekly weigh-ins are the real check.</p>
    </Panel>
  );
}
