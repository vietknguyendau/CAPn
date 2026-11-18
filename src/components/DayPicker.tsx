import { useMemo, useState } from 'react';
import { Check, Dumbbell, Moon, Search, Sparkles, X } from 'lucide-react';
import { useStore } from '../store';
import type { DayPlan } from '../types';
import { TEMPLATES } from '../data/exercises';
import { PROGRAMS, unresolved } from '../data/programs';
import { ACTIVITY_SUGGESTIONS, planName } from '../lib/plan';
import { Btn, cx } from './ui';

type Scope = 'once' | 'always';

/** Choose what a day holds: one of your routines, a library workout, an activity, or rest. */
export function DayPicker({ title, current, onPick, onClose, scopeLabel }: {
  title: string; current: DayPlan; onPick: (p: DayPlan, scope: Scope) => void; onClose: () => void;
  scopeLabel?: { once: string; always: string }; // when set, ask whether this is a one-off change
}) {
  const { data, go } = useStore();
  const [tab, setTab] = useState<'workout' | 'activity' | 'rest'>(current.kind);
  const [q, setQ] = useState('');
  const [label, setLabel] = useState(current.kind === 'workout' ? current.label ?? '' : '');
  const [activity, setActivity] = useState(current.kind === 'activity' ? current.label : '');
  const [restLabel, setRestLabel] = useState(current.kind === 'rest' ? current.label ?? '' : '');
  const [scope, setScope] = useState<Scope>('once');

  const programs = useMemo(() => PROGRAMS.filter((p) => !unresolved(p).length), []);
  const s = q.trim().toLowerCase();
  const libMatches = s ? programs.filter((p) => p.name.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)).slice(0, 25) : programs.filter((p) => p.popular).slice(0, 12);

  const pick = (p: DayPlan) => onPick(p, scope);
  const withLabel = (p: DayPlan): DayPlan => (p.kind === 'workout' && label.trim() ? { ...p, label: label.trim() } : p);
  const selected = (type: string, id: string) => current.kind === 'workout' && current.ref.type === type && current.ref.id === id;

  const Row = ({ name, sub, active, onClick }: { name: string; sub?: string; active?: boolean; onClick: () => void }) => (
    <li>
      <button onClick={onClick} className={cx('flex min-h-[52px] w-full items-center justify-between gap-3 px-1 py-2 text-left active:bg-rim/50', active && 'text-sun')}>
        <span className="min-w-0"><span className="block font-semibold leading-tight">{name}</span>{sub && <span className="block text-sm text-haze">{sub}</span>}</span>
        {active && <Check size={18} />}
      </button>
    </li>
  );

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-ink/80 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="flex max-h-[92%] w-full max-w-xl flex-col rounded-t-3xl border border-rim bg-deck pb-safe" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4">
          <div>
            <h2 className="font-display text-2xl font-semibold leading-tight">{title}</h2>
            <p className="text-sm text-haze">Now: {planName(current, data)}</p>
          </div>
          <button aria-label="Close" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-xl text-haze active:bg-rim"><X size={20} /></button>
        </div>
        {scopeLabel && (
          <div className="mx-5 mt-3 grid grid-cols-2 rounded-xl border border-rim p-1" role="radiogroup" aria-label="Change for">
            {(['once', 'always'] as Scope[]).map((sc) => (
              <button key={sc} role="radio" aria-checked={scope === sc} onClick={() => setScope(sc)}
                className={cx('min-h-[40px] rounded-lg text-sm font-semibold', scope === sc ? 'bg-sun text-ink' : 'text-haze')}>{scopeLabel[sc]}</button>
            ))}
          </div>
        )}
        <div className="mx-5 mt-3 flex gap-1 border-b border-rim" role="tablist">
          {([['workout', 'Workout', Dumbbell], ['activity', 'Activity', Sparkles], ['rest', 'Rest', Moon]] as const).map(([t, l, Icon]) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={cx('flex min-h-[44px] flex-1 items-center justify-center gap-1.5 border-b-2 text-sm font-semibold', tab === t ? 'border-sun text-chalk' : 'border-transparent text-haze')}>
              <Icon size={16} />{l}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {tab === 'workout' && (
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm text-haze">Name this day (optional)</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Push day, Legs, Upper A" maxLength={30}
                  className="min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun" />
              </label>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-haze">My routines</p>
                {data.routines.length ? (
                  <ul className="divide-y divide-rim">
                    {data.routines.map((r) => <Row key={r.id} name={r.name} sub={`${r.items.length} exercises`} active={selected('routine', r.id)} onClick={() => pick(withLabel({ kind: 'workout', ref: { type: 'routine', id: r.id } }))} />)}
                  </ul>
                ) : (
                  <p className="py-2 text-sm text-haze">No routines yet. <button className="text-sun underline underline-offset-4" onClick={() => { onClose(); go('builder'); }}>Build one</button>, save it, then pick it here.</p>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-haze">Momentum basics</p>
                <ul className="divide-y divide-rim">
                  {(['full', 'quick'] as const).map((t) => <Row key={t} name={TEMPLATES[t].title} active={selected('template', t)} onClick={() => pick(withLabel({ kind: 'workout', ref: { type: 'template', id: t } }))} />)}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-haze">Workout library</p>
                <label className="relative mt-1 block">
                  <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-haze" />
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 104 workouts" aria-label="Search workout library"
                    className="min-h-[48px] w-full rounded-xl border border-rim bg-ink pl-10 pr-3 text-chalk outline-none focus:border-sun" />
                </label>
                {!s && <p className="mt-1 text-xs text-haze">Popular picks shown. Search for more.</p>}
                <ul className="divide-y divide-rim">
                  {libMatches.map((p) => <Row key={p.id} name={p.name} sub={p.category} active={selected('program', p.id)} onClick={() => pick(withLabel({ kind: 'workout', ref: { type: 'program', id: p.id } }))} />)}
                </ul>
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div className="space-y-3">
              <p className="text-sm text-haze">Sports, walks, anything that isn’t a gym session.</p>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_SUGGESTIONS.map((a) => (
                  <button key={a} onClick={() => setActivity(a)} aria-pressed={activity === a}
                    className={cx('min-h-[40px] rounded-full border px-3 text-sm', activity === a ? 'border-sun bg-sun font-semibold text-ink' : 'border-rim text-chalk')}>{a}</button>
                ))}
              </div>
              <input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Or type your own" maxLength={30} aria-label="Activity name"
                className="min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun" />
              <Btn size="lg" className="w-full" disabled={!activity.trim()} onClick={() => pick({ kind: 'activity', label: activity.trim() })}>Set {activity.trim() || 'activity'}</Btn>
            </div>
          )}

          {tab === 'rest' && (
            <div className="space-y-3">
              <p className="text-sm text-haze">Rest days don’t count against your weekly goal.</p>
              <input value={restLabel} onChange={(e) => setRestLabel(e.target.value)} placeholder="Name it (optional): Recovery, Off…" maxLength={20} aria-label="Rest day name"
                className="min-h-[48px] w-full rounded-xl border border-rim bg-ink px-3 text-chalk outline-none focus:border-sun" />
              <Btn size="lg" className="w-full" onClick={() => pick({ kind: 'rest', ...(restLabel.trim() ? { label: restLabel.trim() } : {}) })}><Moon size={18} />Make it a rest day</Btn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
