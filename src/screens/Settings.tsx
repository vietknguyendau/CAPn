import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, Download, LogOut, Upload } from 'lucide-react';
import { useAccount, useStore } from '../store';
import type { Activity, WeightUnit } from '../types';
import { EXERCISES, unitLabel } from '../data/exercises';
import { planName, toDayPlan } from '../lib/plan';
import { DAY_NAMES, todayISO } from '../lib/date';
import { Btn, Chips, H2, Panel, Screen, Toggle } from '../components/ui';
import { toCSV } from '../lib/export';
import { normalize } from '../lib/storage';
import { FitbitPanel } from '../components/FitbitPanel';
import { CustomExerciseForm } from '../components/CustomExerciseForm';
import type { CustomExercise } from '../types';
import { BODY_PARTS } from '../data/exercises';

const BASE_EQUIP = ['leg-press', 'chest-press', 'lat-pulldown', 'seated-row', 'db-shoulder-press'];

export default function Settings() {
  const { data, update, replace, reset, go } = useStore();
  const account = useAccount();
  const fileRef = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const EQUIP = [...new Set([...BASE_EQUIP, ...data.workouts.flatMap((w) => w.exercises.filter((e) => EXERCISES[e.exerciseId]?.kind === 'strength' && !EXERCISES[e.exerciseId]?.bodyweight).map((e) => e.exerciseId))])];
  const set = (fn: (d: typeof s) => void) => update((d) => { fn(d.settings); return d; });

  const confirmUnit = (id: string, unit: WeightUnit) => update((d) => {
    d.settings.equipment[id] = { unit, confirmed: true };
    for (const w of d.workouts) for (const e of w.exercises) {
      if (e.exerciseId !== id) continue;
      for (const st of e.sets) if (!st.unitConfirmed) { st.unit = unit; st.unitConfirmed = true; }
    }
    return d;
  });

  const download = (name: string, body: string, type: string) => {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <Screen title="Settings" right={<Btn variant="ghost" onClick={() => go('home')}><ChevronLeft size={18} />Back</Btn>}>
      {account && <AccountPanel />}
      <FitbitPanel />
      <Panel>
        <H2>Weight units</H2>
        <Chips options={[{ value: 'lb', label: 'Pounds (lb)' }, { value: 'kg', label: 'Kilograms (kg)' }]} value={s.defaultUnit} onChange={(v) => set((x) => { x.defaultUnit = v; })} />
      </Panel>

      <Panel>
        <H2>Equipment units</H2>
        <p className="mb-3 text-sm text-haze">Machines at different gyms label weights differently. Confirming a unit updates past logs that were marked unverified.</p>
        <ul className="divide-y divide-rim">
          {EQUIP.map((id) => {
            const pref = s.equipment[id] ?? { unit: EXERCISES[id].defaultUnit === 'machine' ? 'machine' : s.defaultUnit, confirmed: EXERCISES[id].defaultUnit !== 'machine' };
            return (
              <li key={id} className="py-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{EXERCISES[id].name}</span>
                  <span className={pref.confirmed ? 'text-sm text-tide' : 'text-sm text-flare'}>{pref.confirmed ? `Confirmed: ${unitLabel(pref.unit)}` : 'Unverified'}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(['lb', 'kg', 'machine'] as WeightUnit[]).map((u) => (
                    <Btn key={u} variant={pref.confirmed && pref.unit === u ? 'tide' : 'ghost'} onClick={() => confirmUnit(id, u)}>{u === 'machine' ? 'Machine units' : u}</Btn>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <H2>My goal</H2>
        <p className="text-sm text-haze">{s.goal ? `${s.goal.focus.join(' + ')} · ${s.goal.daysPerWeek} days a week` : 'Set a goal to get plans that fit you.'}</p>
        <Btn variant="ghost" className="mt-3 w-full" onClick={() => go('goal')}>{s.goal ? 'View goal & plans' : 'Set my goal'}</Btn>
      </Panel>

      <MyExercises />

      <Panel>
        <H2>My week</H2>
        <ol className="space-y-1 text-sm">
          {s.weeklyPlan.map(toDayPlan).map((p, i) => (
            <li key={i} className="flex justify-between gap-3"><span className="text-haze">{DAY_NAMES[i]}</span><span className="truncate text-right">{planName(p, data)}</span></li>
          ))}
        </ol>
        <Btn variant="ghost" className="mt-3 w-full" onClick={() => go('week')}>Edit my week</Btn>
      </Panel>

      <Panel>
        <H2>Workout windows</H2>
        <div className="space-y-3">
          {s.windows.map((w, i) => (
            <div key={w.id} className="flex items-center justify-between gap-2">
              <span className="w-16">{w.label}</span>
              <input type="time" value={w.start} aria-label={`${w.label} start`} onChange={(e) => set((x) => { x.windows[i].start = e.target.value; })}
                className="min-h-[44px] flex-1 rounded-xl border border-rim bg-ink px-2 text-chalk" />
              <span className="text-haze">to</span>
              <input type="time" value={w.end} aria-label={`${w.label} end`} onChange={(e) => set((x) => { x.windows[i].end = e.target.value; })}
                className="min-h-[44px] flex-1 rounded-xl border border-rim bg-ink px-2 text-chalk" />
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <H2>Notifications</H2>
        <p className="mb-2 text-sm text-haze">Saved for when push notifications are added. Reminders will never use guilt or streak-shaming.</p>
        <Toggle label="Workout window reminders" checked={s.notifications.reminders} onChange={(v) => set((x) => { x.notifications.reminders = v; })} />
        <Toggle label="Mood check-in prompts" checked={s.notifications.checkIns} onChange={(v) => set((x) => { x.notifications.checkIns = v; })} />
        <Toggle label="Weekly summary" checked={s.notifications.weeklySummary} onChange={(v) => set((x) => { x.notifications.weeklySummary = v; })} />
      </Panel>

      <Panel>
        <H2>Goals</H2>
        <ol className="list-decimal space-y-1 pl-5">{s.goals.map((g) => <li key={g}>{g}</li>)}</ol>
        <div className="mt-3 border-t border-rim pt-2">
          <Toggle label="Track bodyweight" hint="Optional. Shown on the Progress screen." checked={s.trackBodyweight} onChange={(v) => set((x) => { x.trackBodyweight = v; })} />
        </div>
      </Panel>

      <Panel>
        <H2>Your data</H2>
        <p className="mb-3 text-sm text-haze">{account ? 'Saved to your account and synced across devices.' : 'Stored on this device only.'} Export a copy any time.</p>
        <div className="flex flex-wrap gap-2">
          <Btn variant="ghost" onClick={() => download(`momentum-${todayISO()}.json`, JSON.stringify(data, null, 2), 'application/json')}><Download size={16} />Export JSON</Btn>
          <Btn variant="ghost" onClick={() => download(`momentum-sets-${todayISO()}.csv`, toCSV(data), 'text/csv')}><Download size={16} />Export CSV</Btn>
        </div>
        <Btn variant="ghost" className="mt-2" onClick={() => fileRef.current?.click()}><Upload size={16} />Import backup (adds, never deletes)</Btn>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          try {
            const parsed = JSON.parse(await f.text());
            if (parsed.version !== 1 || !Array.isArray(parsed.workouts)) throw new Error('not a Momentum backup');
            const backup = normalize(parsed);
            const cols = ['workouts', 'checkIns', 'bodyweight', 'routines', 'healthDays'] as const;
            const merged = structuredClone(data);
            let added = 0;
            for (const c of cols) {
              const have = new Set((merged[c] as { id: string }[]).map((x) => x.id));
              const fresh = (backup[c] as { id: string }[]).filter((x) => !have.has(x.id));
              added += c === 'workouts' ? fresh.length : 0;
              (merged[c] as unknown[]).push(...fresh);
            }
            if (confirm(`Add ${added} workout${added === 1 ? '' : 's'} (plus check-ins and routines) from this backup? Everything already here stays.`)) replace(merged);
          } catch { alert('That file isn’t a Momentum JSON backup.'); }
        }} />
        <div>
          <Btn variant="quiet" className="mt-3 px-0 text-flare" onClick={() => {
            const msg = account ? 'Erase every workout, check-in and routine on this account? This can’t be undone.' : 'Erase everything and restore the Nov 2 baseline? This can’t be undone.';
            if (confirm(msg)) reset();
          }}>{account ? 'Erase all my data' : 'Reset all data'}</Btn>
        </div>
      </Panel>
    </Screen>
  );
}

const STATUS: Record<string, { text: string; cls: string }> = {
  synced: { text: 'All changes saved', cls: 'text-tide' },
  saving: { text: 'Saving…', cls: 'text-haze' },
  offline: { text: 'Offline. Changes will sync when you reconnect.', cls: 'text-sun' },
  error: { text: 'Couldn’t save. Retrying shortly.', cls: 'text-flare' },
};

function AccountPanel() {
  const account = useAccount()!;
  const [status, setStatus] = useState('synced');
  const [name, setName] = useState(account.displayName);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => account.sync.subscribe(setStatus), [account]);
  const input = 'min-h-[44px] min-w-0 flex-1 rounded-xl border border-rim bg-ink px-3 outline-none focus:border-sun';
  return (
    <Panel tone="tide">
      <H2>Account</H2>
      <p className="font-semibold">{account.displayName || 'No name set'}</p>
      <p className="text-sm text-haze">{account.email}</p>
      <p className={`mt-1 text-sm ${STATUS[status]?.cls}`} role="status">{STATUS[status]?.text}</p>

      <div className="mt-4 space-y-2 border-t border-rim pt-4">
        <label className="block text-sm text-haze" htmlFor="dn">Display name</label>
        <div className="flex gap-2">
          <input id="dn" className={input} value={name} onChange={(e) => setName(e.target.value)} />
          <Btn variant="ghost" disabled={!name.trim() || name === account.displayName} onClick={async () => {
            const err = await account.setDisplayName(name.trim());
            setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Name updated.' });
          }}>Save</Btn>
        </div>
        <label className="block pt-2 text-sm text-haze" htmlFor="pw">New password</label>
        <div className="flex gap-2">
          <input id="pw" type="password" minLength={8} autoComplete="new-password" className={input} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" />
          <Btn variant="ghost" disabled={pw.length < 8} onClick={async () => {
            const err = await account.changePassword(pw);
            setMsg(err ? { ok: false, text: err } : { ok: true, text: 'Password changed.' }); if (!err) setPw('');
          }}>Change</Btn>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? 'text-tide' : 'text-flare'}`} role="status">{msg.text}</p>}
      </div>
      <Btn variant="ghost" className="mt-4 w-full" onClick={() => account.signOut()}><LogOut size={16} />Sign out</Btn>
    </Panel>
  );
}

function MyExercises() {
  const { data, update, go } = useStore();
  const [editing, setEditing] = useState<CustomExercise | null>(null);
  const list = [...data.customExercises].sort((a, b) => Number(!!a.archived) - Number(!!b.archived) || a.name.localeCompare(b.name));
  const used = (id: string) => data.workouts.some((w) => w.exercises.some((e) => e.exerciseId === id));
  return (
    <Panel>
      <H2>My exercises</H2>
      {list.length === 0 ? (
        <p className="text-sm text-haze">Exercises and sports you add yourself show up here. Add one from <button className="underline underline-offset-4" onClick={() => go('builder')}>Build a workout</button>.</p>
      ) : (
        <ul className="divide-y divide-rim">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-2 py-2">
              <div className={`min-w-0 flex-1 ${c.archived ? 'opacity-50' : ''}`}>
                <p className="truncate font-semibold">{c.name}</p>
                <p className="text-xs text-haze">{BODY_PARTS.find((p) => p.id === c.parts[0])?.label} · {c.kind === 'cardio' ? 'minutes' : c.kind === 'timed' ? 'timed hold' : 'weight × reps'}{c.archived ? ' · hidden' : ''}</p>
              </div>
              <Btn variant="quiet" onClick={() => setEditing(c)}>Edit</Btn>
              <Btn variant="quiet" onClick={() => update((d) => {
                const x = d.customExercises.find((y) => y.id === c.id);
                if (!x) return d;
                if (!x.archived && !used(c.id) && confirm(`Delete “${c.name}”? It hasn’t been used in any workout.`)) {
                  d.customExercises = d.customExercises.filter((y) => y.id !== c.id);
                  d.draft.items = d.draft.items.filter((i) => i.exerciseId !== c.id);
                } else x.archived = !x.archived; // keep history readable: hide instead of delete once used
                return d;
              })}>{c.archived ? 'Show' : used(c.id) ? 'Hide' : 'Remove'}</Btn>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <CustomExerciseForm initial={editing} onClose={() => setEditing(null)} onSave={(c) => {
          update((d) => { d.customExercises = d.customExercises.map((x) => (x.id === c.id ? c : x)); return d; });
          setEditing(null);
        }} />
      )}
    </Panel>
  );
}
