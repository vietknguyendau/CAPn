import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, ChevronLeft, Clock, Info, Minus, Play, Plus, Save, Search, X } from 'lucide-react';
import { useStore } from '../store';
import type { BodyPart, BuilderDraft, CustomExercise, PlanItem } from '../types';
import { BODY_PARTS, EXERCISES } from '../data/exercises';
import { draftToItems, startCustom } from '../lib/session';
import { estimate, guidance } from '../lib/estimate';
import { fmtRec, recommend } from '../lib/progression';
import { fmtLong, todayISO, uid } from '../lib/date';
import { Badge, Btn, H2, Panel, Screen, Toggle, cx } from '../components/ui';
import { CustomExerciseForm } from '../components/CustomExerciseForm';
import { ExerciseInfo } from '../components/ExerciseInfo';
import type { ExerciseDef } from '../data/exercises';


export default function Builder() {
  const { data, update, go, logDate, setLogDate } = useStore();
  const [part, setPart] = useState<BodyPart | 'all'>('all');
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [equip, setEquip] = useState('any');
  const [level, setLevel] = useState('any');
  const [shown, setShown] = useState(30);
  const [info, setInfo] = useState<ExerciseDef | null>(null);
  const rank = (e: ExerciseDef) => (e.custom ? 0 : e.library ? 2 : 1);
  const ALL = Object.values(EXERCISES).filter((e) => !e.archived).sort((a, b) => rank(a) - rank(b) || (a.library ? a.name.localeCompare(b.name) : 0));
  const EQUIP_OPTIONS = [...new Set(ALL.map((e) => e.equipment))].sort();
  const draft = data.draft;

  const setDraft = (fn: (d: BuilderDraft) => void) => { setSaved(false); update((d) => { fn(d.draft); return d; }); };
  const selectedIdx = (id: string) => draft.items.findIndex((i) => i.exerciseId === id);
  const toggle = (id: string) => setDraft((d) => {
    const i = d.items.findIndex((x) => x.exerciseId === id);
    if (i >= 0) d.items.splice(i, 1);
    else {
      const def = EXERCISES[id];
      d.items.push(def.kind === 'cardio' ? { exerciseId: id, sets: 1, minutes: def.defaultMinutes ?? 10 } : { exerciseId: id, sets: def.targetSets });
    }
  });
  const patch = (i: number, p: Partial<PlanItem>) => setDraft((d) => { Object.assign(d.items[i], p); });
  const move = (i: number, dir: -1 | 1) => setDraft((d) => {
    const j = i + dir; if (j < 0 || j >= d.items.length) return;
    [d.items[i], d.items[j]] = [d.items[j], d.items[i]];
  });

  const addCustom = (c: CustomExercise) => {
    setSaved(false);
    update((d) => {
      d.customExercises.push(c);
      d.draft.items.push(c.kind === 'cardio' ? { exerciseId: c.id, sets: 1, minutes: c.defaultMinutes ?? 30 } : { exerciseId: c.id, sets: 2 });
      return d;
    });
    setAdding(false);
    if (part !== 'all' && part !== c.parts[0]) setPart(c.parts[0]);
  };

  const est = estimate(draftToItems(draft), { warmup: false, cooldown: draft.cooldown });
  const tips = guidance(est, data.settings);
  const q = query.trim().toLowerCase();
  const filtered = ALL.filter((e) =>
    (part === 'all' || e.parts.includes(part)) &&
    (equip === 'any' || e.equipment === equip) &&
    (level === 'any' || e.level === level || (!e.level && level === 'beginner' && !e.library)) &&
    (!q || e.name.toLowerCase().includes(q) || e.primaryMuscles?.some((m) => m.includes(q)) || e.equipment.toLowerCase().includes(q)));
  const list = filtered.slice(0, shown);
  const covered = new Set(draft.items.flatMap((i) => EXERCISES[i.exerciseId].parts.slice(0, 1)));
  const countFor = (p: BodyPart) => draft.items.filter((i) => EXERCISES[i.exerciseId].parts.includes(p)).length;

  const start = () => {
    update((d) => {
      startCustom(d, d.draft, name.trim() || 'Custom workout', logDate ?? undefined);
      d.draft = { items: [], warmup: d.draft.warmup, cooldown: d.draft.cooldown }; // next build starts empty
      return d;
    });
    setLogDate(null); go('train');
  };
  const clearAll = () => {
    if (!draft.items.length || confirm(`Remove all ${draft.items.length} exercises from this workout?`)) { setDraft((d) => { d.items = []; }); setName(''); }
  };
  const save = () => {
    const n = name.trim() || `My workout ${data.routines.length + 1}`;
    update((d) => {
      const existing = d.routines.find((r) => r.name.toLowerCase() === n.toLowerCase());
      if (existing) Object.assign(existing, structuredClone(d.draft));
      else d.routines.push({ id: uid(), name: n, createdAt: new Date().toISOString(), ...structuredClone(d.draft) });
      return d;
    });
    setName(n); setSaved(true);
  };

  return (
    <>
      <Screen title={logDate ? 'Log a past workout' : 'Build a workout'} sub={logDate ? fmtLong(logDate) : 'Pick a body part, tap to add'}
        right={<Btn variant="ghost" onClick={() => go('train')}><ChevronLeft size={18} />Back</Btn>}>

        <label className="flex items-center justify-between gap-3">
          <span className="text-sm text-haze">Date</span>
          <input type="date" value={logDate ?? todayISO()} max={todayISO()} aria-label="Workout date"
            onChange={(e) => setLogDate(e.target.value && e.target.value !== todayISO() ? e.target.value : null)}
            className="min-h-[44px] rounded-xl border border-rim bg-ink px-3 text-chalk [color-scheme:dark]" />
        </label>

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Body part">
          {[{ id: 'all' as const, label: 'All' }, ...BODY_PARTS].map((p) => {
            const n = p.id === 'all' ? draft.items.length : countFor(p.id);
            return (
              <button key={p.id} role="tab" aria-selected={part === p.id} onClick={() => { setPart(p.id); setShown(30); }}
                className={cx('flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold',
                  part === p.id ? 'border-sun bg-sun text-ink' : 'border-rim text-chalk')}>
                {p.label}
                {n > 0 && <span className={cx('rounded-full px-1.5 text-xs', part === p.id ? 'bg-ink/20' : 'bg-rim')}>{n}</span>}
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <label className="relative block">
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haze" />
            <input type="search" value={query} onChange={(e) => { setQuery(e.target.value); setShown(30); }} placeholder={`Search ${ALL.length} exercises`} aria-label="Search exercises"
              className="min-h-[48px] w-full rounded-xl border border-rim bg-deck pl-10 pr-3 text-chalk outline-none focus:border-sun" />
          </label>
          <div className="flex gap-2">
            <select value={equip} onChange={(e) => { setEquip(e.target.value); setShown(30); }} aria-label="Equipment" className="min-h-[44px] flex-1 rounded-xl border border-rim bg-deck px-3 text-chalk">
              <option value="any">Any equipment</option>
              {EQUIP_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <select value={level} onChange={(e) => { setLevel(e.target.value); setShown(30); }} aria-label="Level" className="min-h-[44px] flex-1 rounded-xl border border-rim bg-deck px-3 text-chalk">
              <option value="any">Any level</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="expert">Expert</option>
            </select>
          </div>
          <p className="text-sm text-haze" aria-live="polite">{filtered.length} exercise{filtered.length === 1 ? '' : 's'}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setAdding(true)}
            className="flex min-h-[84px] flex-col items-start justify-between rounded-2xl border border-dashed border-sun/60 p-3 text-left text-sun active:bg-sun/10">
            <span className="font-semibold leading-tight">+ Add your own</span>
            <span className="mt-2 text-xs text-haze">{part === 'all' ? 'Any category' : `In ${BODY_PARTS.find((p) => p.id === part)?.label}`}</span>
          </button>
          {list.map((def) => {
            const idx = selectedIdx(def.id);
            const r = def.kind === 'cardio' ? null : recommend(def.id, data);
            return (
              <div key={def.id} className={cx('relative overflow-hidden rounded-2xl border transition-colors',
                idx >= 0 ? 'border-sun bg-sun/10' : 'border-rim bg-deck')}>
                <button onClick={() => toggle(def.id)} aria-pressed={idx >= 0} className="flex h-full min-h-[84px] w-full flex-col text-left active:bg-rim/50">
                  {def.images?.[0] && (
                    <img src={def.images[0]} alt="" loading="lazy" className="aspect-[16/10] w-full bg-chalk/90 object-cover" />
                  )}
                  <span className="flex flex-1 flex-col justify-between p-3 pr-9">
                    <span className="font-semibold leading-tight">{def.name}</span>
                    {def.custom && <span className="mt-1"><Badge>Yours</Badge></span>}
                    <span className="mt-2 text-xs text-haze">
                      {r && r.source !== 'none' ? `Next: ${fmtRec(r, def.perHand)}` : def.kind === 'cardio' ? `${def.defaultMinutes ?? 10} min` : def.equipment}
                    </span>
                  </span>
                </button>
                {idx >= 0 && (
                  <span className="pointer-events-none absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-sun font-display text-sm font-bold text-ink">{idx + 1}</span>
                )}
                <button aria-label={`About ${def.name}`} onClick={() => setInfo(def)}
                  className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-lg text-haze active:bg-rim"><Info size={18} /></button>
              </div>
            );
          })}
        </div>
        {filtered.length > shown && (
          <Btn variant="ghost" className="w-full" onClick={() => setShown((n) => n + 30)}>Show more ({filtered.length - shown} left)</Btn>
        )}
        {filtered.length === 0 && <p className="text-center text-haze">No matches. Try another word, or add it yourself.</p>}
        {info && <ExerciseInfo def={info} selected={selectedIdx(info.id) >= 0} onToggle={() => toggle(info.id)} onClose={() => setInfo(null)} />}
        {adding && <CustomExerciseForm defaultPart={part === 'all' ? undefined : part} onSave={addCustom} onClose={() => setAdding(false)} />}

        <Panel>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-semibold">Your workout</h2>
              {draft.items.length > 0 && <p className="text-sm text-haze">{draft.items.length} exercise{draft.items.length > 1 ? 's' : ''} · {est.workingSets} working sets</p>}
            </div>
            {draft.items.length > 0 && <Btn variant="ghost" onClick={clearAll}><X size={16} />Clear all</Btn>}
          </div>
          {draft.items.length === 0 ? (
            <p className="text-haze">Nothing yet. Tap exercises above to add them in the order you want to do them.</p>
          ) : (
            <ol className="divide-y divide-rim">
              {draft.items.map((it, i) => {
                const def = EXERCISES[it.exerciseId];
                const isCardio = def.kind === 'cardio';
                const val = isCardio ? it.minutes ?? 10 : it.sets;
                const set = (v: number) => patch(i, isCardio ? { minutes: Math.max(5, v) } : { sets: Math.min(6, Math.max(1, v)) });
                const stepAmt = isCardio ? 5 : 1;
                return (
                  <li key={it.exerciseId} className="py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold leading-tight"><span className="mr-1.5 font-display text-sun">{i + 1}</span>{def.name}</p>
                        <p className="text-xs text-haze">{isCardio ? 'Cardio' : def.kind === 'timed' ? `${def.targetSec} sec holds` : `${def.repRange?.join('–')} reps`}{def.unilateral ? ', each side' : ''}</p>
                      </div>
                      <button aria-label={`Remove ${def.name}`} onClick={() => toggle(it.exerciseId)} className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center text-haze"><X size={18} /></button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex gap-1">
                        <button aria-label={`Move ${def.name} up`} disabled={i === 0} onClick={() => move(i, -1)} className="grid h-10 w-10 place-items-center rounded-lg border border-rim text-haze disabled:opacity-20"><ArrowUp size={16} /></button>
                        <button aria-label={`Move ${def.name} down`} disabled={i === draft.items.length - 1} onClick={() => move(i, 1)} className="grid h-10 w-10 place-items-center rounded-lg border border-rim text-haze disabled:opacity-20"><ArrowDown size={16} /></button>
                      </div>
                      <div className="flex items-center gap-1">
                        <button aria-label="Less" onClick={() => set(val - stepAmt)} className="grid h-10 w-10 place-items-center rounded-lg border border-rim"><Minus size={16} /></button>
                        <span className="w-20 text-center font-display text-2xl font-semibold">{val}<span className="ml-1 font-sans text-xs text-haze">{isCardio ? 'min' : val === 1 ? 'set' : 'sets'}</span></span>
                        <button aria-label="More" onClick={() => set(val + stepAmt)} className="grid h-10 w-10 place-items-center rounded-lg border border-rim"><Plus size={16} /></button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="mt-3 border-t border-rim pt-2">
            <Toggle label="5-minute warm-up" hint="Easy treadmill or bike before lifting" checked={draft.warmup} onChange={(v) => setDraft((d) => { d.warmup = v; })} />
            <Toggle label="5-minute cooldown" hint="Easy walk and stretching" checked={draft.cooldown} onChange={(v) => setDraft((d) => { d.cooldown = v; })} />
          </div>
        </Panel>

        {draft.items.length > 0 && (
          <Panel tone="sun">
            <div className="flex items-start gap-3">
              <Clock className="mt-1 shrink-0 text-sun" />
              <div>
                <p className="text-sm text-haze">Set aside about</p>
                <p className="font-display text-6xl font-bold leading-none">{est.block}<span className="ml-1 text-2xl font-semibold text-haze">min</span></p>
                <p className="mt-1 text-sm text-haze">Usually {est.low}–{est.high} min of training, plus a few minutes of buffer.</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-[1fr_auto] gap-y-1.5 text-sm">
              {([
                ['Warm-up', draft.warmup ? 5 : 0],
                ['Lifting time', est.lifting],
                ['Rest between sets', est.rest],
                ['Moving between machines', est.setup],
                ['Cardio', est.cardio - (draft.warmup ? 5 : 0)],
                ['Cooldown', est.cooldown],
                ['Buffer (busy gym, water)', est.buffer],
              ] as [string, number][]).map(([k, v]) => v > 0 && (
                <div key={k} className="contents"><dt className="text-haze">{k}</dt><dd className="text-right font-semibold">{Math.round(v)} min</dd></div>
              ))}
            </dl>
            <ul className="mt-3 space-y-1.5 border-t border-rim pt-3 text-sm">
              {tips.map((t) => <li key={t.text} className={t.tone === 'warn' ? 'text-flare' : 'text-tide'}>{t.text}</li>)}
              {covered.size > 0 && <li className="text-haze">Focus: {BODY_PARTS.filter((p) => covered.has(p.id)).map((p) => p.label).join(', ')}</li>}
            </ul>
            <p className="mt-3 text-xs text-haze">Estimate assumes about 4 seconds per rep and the listed rest. Your history shows the estimate next to your actual time.</p>
          </Panel>
        )}

        {draft.items.length > 0 && (
          <Panel>
            <H2>Save as a routine</H2>
            <div className="flex gap-2">
              <input value={name} onChange={(e) => { setName(e.target.value); setSaved(false); }} placeholder="e.g. Upper body A" aria-label="Routine name"
                className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-rim bg-ink px-3 outline-none focus:border-sun" />
              <Btn variant="ghost" onClick={save}>{saved ? <><Check size={16} />Saved</> : <><Save size={16} />Save</>}</Btn>
            </div>
          </Panel>
        )}
        <div className="h-16" />
      </Screen>

      {draft.items.length > 0 && (
        <div className="fixed inset-x-0 bottom-[76px] z-10 border-t border-rim bg-ink/95 backdrop-blur">
          <div className="mx-auto flex max-w-xl items-center gap-3 px-4 py-2">
            <p className="flex-1 text-sm"><span className="font-semibold">{draft.items.length} exercise{draft.items.length > 1 ? 's' : ''}</span><span className="text-haze"> · about {est.block} min</span></p>
            <Btn onClick={start}><Play size={16} />{logDate ? 'Log it' : 'Start'}</Btn>
          </div>
        </div>
      )}
    </>
  );
}
