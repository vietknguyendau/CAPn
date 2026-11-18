import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, Clock, Flame, Pencil, Play, Search, Timer, X } from 'lucide-react';
import { useStore } from '../store';
import { EXERCISES } from '../data/exercises';
import { EQUIPMENT_LABEL, PROGRAMS, PROGRAM_CATEGORIES, programItems, resolveMove, unresolved, type Equipment, type Program, type ProgramCategory } from '../data/programs';
import { estimate } from '../lib/estimate';
import { startProgram } from '../lib/session';
import { addDays, toISO, todayISO } from '../lib/date';
import { describeInterval } from '../components/IntervalStep';
import { Badge, Btn, Screen, cx } from '../components/ui';

const LEVEL = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' } as const;
const minutesFor = (p: Program) => estimate(programItems(p), { warmup: false, cooldown: p.cooldown }).block;

export default function Programs() {
  const { data, go } = useStore();
  const [cat, setCat] = useState<ProgramCategory | 'popular' | 'all'>('popular');
  const [q, setQ] = useState('');
  const [equip, setEquip] = useState<Equipment | 'any'>('any');
  const [level, setLevel] = useState<'any' | Program['level']>('any');
  const [maxMin, setMaxMin] = useState(0);
  const [open, setOpen] = useState<Program | null>(null);

  const list = useMemo(() => PROGRAMS.filter((p) => unresolved(p).length === 0), []);
  const mins = useMemo(() => new Map(list.map((p) => [p.id, minutesFor(p)])), [list]);
  const doneCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of data.workouts) for (const p of list) if (w.title === p.name) m.set(p.id, (m.get(p.id) ?? 0) + 1);
    return m;
  }, [data.workouts, list]);

  const s = q.trim().toLowerCase();
  const shown = list.filter((p) =>
    (cat === 'all' || (cat === 'popular' ? p.popular : p.category === cat)) &&
    (equip === 'any' || p.equipment === equip) &&
    (level === 'any' || p.level === level) &&
    (!maxMin || (mins.get(p.id) ?? 0) <= maxMin) &&
    (!s || p.name.toLowerCase().includes(s) || p.blurb.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)));

  return (
    <Screen title="Workout library" sub={`${list.length} ready-made workouts`}
      right={<Btn variant="ghost" onClick={() => go('train')}><ChevronLeft size={18} />Back</Btn>}>
      <label className="relative block">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haze" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: tabata, legs, 20 minute…" aria-label="Search workouts"
          className="min-h-[48px] w-full rounded-xl border border-rim bg-deck pl-10 pr-3 text-chalk outline-none focus:border-sun" />
      </label>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Category">
        {(['popular', 'all', ...PROGRAM_CATEGORIES] as const).map((c) => (
          <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
            className={cx('flex min-h-[44px] shrink-0 items-center gap-1 rounded-full border px-4 text-sm font-semibold',
              cat === c ? 'border-sun bg-sun text-ink' : 'border-rim text-chalk')}>
            {c === 'popular' && <Flame size={14} />}{c === 'popular' ? 'Popular' : c === 'all' ? 'All' : c}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <select value={equip} onChange={(e) => setEquip(e.target.value as Equipment | 'any')} aria-label="Equipment" className="min-h-[44px] rounded-xl border border-rim bg-deck px-2 text-sm text-chalk">
          <option value="any">Any gear</option>
          {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((k) => <option key={k} value={k}>{EQUIPMENT_LABEL[k]}</option>)}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)} aria-label="Level" className="min-h-[44px] rounded-xl border border-rim bg-deck px-2 text-sm text-chalk">
          <option value="any">Any level</option>
          <option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option>
        </select>
        <select value={maxMin} onChange={(e) => setMaxMin(Number(e.target.value))} aria-label="Time" className="min-h-[44px] rounded-xl border border-rim bg-deck px-2 text-sm text-chalk">
          <option value={0}>Any time</option><option value={20}>≤ 20 min</option><option value={30}>≤ 30 min</option><option value={45}>≤ 45 min</option><option value={60}>≤ 60 min</option>
        </select>
      </div>
      <p className="text-sm text-haze" aria-live="polite">{shown.length} workout{shown.length === 1 ? '' : 's'}</p>

      <ul className="space-y-2">
        {shown.map((p) => {
          const timed = p.blocks.some((b) => 'interval' in b);
          const done = doneCount.get(p.id);
          return (
            <li key={p.id}>
              <button onClick={() => setOpen(p)} className="w-full rounded-2xl border border-rim bg-deck p-4 text-left active:bg-rim/60">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-display text-2xl font-semibold leading-tight">{p.name}</p>
                  <span className="flex shrink-0 items-center gap-1 font-display text-xl text-sun"><Clock size={16} />{mins.get(p.id)}m</span>
                </div>
                <p className="mt-1 text-sm text-haze">{p.blurb}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge>{p.category}</Badge><Badge>{LEVEL[p.level]}</Badge><Badge>{EQUIPMENT_LABEL[p.equipment]}</Badge>
                  {timed && <Badge tone="tide">Timer</Badge>}
                  {done ? <Badge tone="sun">Done {done}×</Badge> : null}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      {shown.length === 0 && <p className="text-center text-haze">No workouts match. Try clearing a filter.</p>}
      {open && <ProgramSheet p={open} minutes={mins.get(open.id) ?? 0} onClose={() => setOpen(null)} />}
    </Screen>
  );
}

function ProgramSheet({ p, minutes, onClose }: { p: Program; minutes: number; onClose: () => void }) {
  const { update, go, setFinishedId, setLogDate } = useStore();
  const [past, setPast] = useState(false);
  const [date, setDate] = useState(() => toISO(addDays(new Date(), -1)));
  const plain = p.blocks.filter((b) => !('interval' in b)) as { ex: string; sets?: number; minutes?: number }[];
  const hasTimed = plain.length < p.blocks.length;

  const start = (d?: string) => { setFinishedId(null); update((x) => startProgram(x, p, d)); onClose(); go('train'); };
  const customize = () => {
    update((x) => {
      x.draft = {
        warmup: p.warmup, cooldown: p.cooldown,
        items: plain.map((b) => { const id = resolveMove(b.ex)!; const def = EXERCISES[id];
          return def.kind === 'cardio' ? { exerciseId: id, sets: 1, minutes: b.minutes ?? def.defaultMinutes ?? 10 } : { exerciseId: id, sets: b.sets ?? def.targetSets }; }),
      };
      return x;
    });
    setLogDate(null); onClose(); go('builder');
  };

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={p.name} onClick={onClose}>
      <div className="max-h-[92%] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-rim bg-deck p-5 pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-sun">{p.category} · {LEVEL[p.level]} · {EQUIPMENT_LABEL[p.equipment]}</p>
            <h2 className="font-display text-4xl font-bold leading-tight">{p.name}</h2>
          </div>
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>
        <p className="mt-1">{p.blurb}</p>
        <p className="mt-2 flex items-center gap-1.5 text-haze"><Clock size={16} />Set aside about <span className="font-display text-xl text-chalk">{minutes} min</span></p>

        <ol className="mt-4 divide-y divide-rim rounded-2xl border border-rim">
          {p.warmup && <li className="px-4 py-2.5 text-sm text-haze">5-minute warm-up</li>}
          {p.blocks.map((b, i) => {
            if ('interval' in b) {
              const iv = { ...b.interval, moves: b.interval.moves.map((m) => resolveMove(m) ?? m) };
              return (
                <li key={i} className="px-4 py-3">
                  <p className="flex items-center gap-1.5 font-semibold"><Timer size={16} className="text-tide" />{iv.name}</p>
                  <p className="text-sm text-haze">{describeInterval(iv)}</p>
                  {iv.reps && <p className="text-sm text-haze">{iv.reps.join(' · ')}</p>}
                </li>
              );
            }
            const def = EXERCISES[resolveMove(b.ex)!];
            return (
              <li key={i} className="flex items-baseline justify-between gap-3 px-4 py-3">
                <span className="font-semibold">{def.name}</span>
                <span className="shrink-0 text-sm text-haze">
                  {def.kind === 'cardio' ? `${b.minutes ?? def.defaultMinutes ?? 10} min` : def.kind === 'timed' ? `${b.sets ?? def.targetSets} × ${def.targetSec ?? 30}s` : `${b.sets ?? def.targetSets} × ${def.repRange?.join('–')}`}
                </span>
              </li>
            );
          })}
          {p.cooldown && <li className="px-4 py-2.5 text-sm text-haze">5-minute cooldown</li>}
        </ol>

        <div className="mt-4 grid gap-2">
          <Btn size="lg" onClick={() => start()}><Play size={18} />Start workout</Btn>
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="ghost" onClick={() => setPast((v) => !v)} aria-expanded={past}><CalendarPlus size={16} />Log a past day</Btn>
            <Btn variant="ghost" onClick={customize}><Pencil size={16} />Customize</Btn>
          </div>
          {past && (
            <div className="flex gap-2">
              <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Workout date"
                className="min-h-[48px] flex-1 rounded-xl border border-rim bg-ink px-3 text-chalk [color-scheme:dark]" />
              <Btn onClick={() => start(date)}>Log it</Btn>
            </div>
          )}
          {hasTimed && <p className="text-xs text-haze">Customize copies the regular exercises into the builder. Timed blocks run from the program itself.</p>}
        </div>
      </div>
    </div>
  );
}
