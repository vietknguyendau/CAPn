import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppData } from './types';
import type { Persistence } from './lib/storage';
import { ensureKnown, registerCustomExercises } from './data/exercises';

export type Tab = 'home' | 'train' | 'progress' | 'wellness' | 'coach' | 'settings' | 'builder' | 'programs' | 'food' | 'week' | 'recipes' | 'goal' | 'mealplan';

interface Store {
  data: AppData;
  update: (fn: (d: AppData) => AppData) => void;
  replace: (d: AppData) => void;
  reset: () => void;
  tab: Tab;
  go: (t: Tab) => void;
  finishedId: string | null;
  setFinishedId: (id: string | null) => void;
  logDate: string | null; // set when logging a past day
  setLogDate: (d: string | null) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children, initial, persistence }: { children: ReactNode; initial: AppData; persistence: Persistence }) {
  const [data, setData] = useState<AppData>(initial);
  registerCustomExercises(data.customExercises); // keep the exercise lookup in step with this person's list
  ensureKnown([
    ...data.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)),
    ...data.draft.items.map((i) => i.exerciseId),
    ...data.routines.flatMap((r) => r.items.map((i) => i.exerciseId)),
    ...(data.active?.workout.exercises.map((e) => e.exerciseId) ?? []),
  ]);
  const [tab, setTab] = useState<Tab>(initial.active ? 'train' : 'home');
  const [finishedId, setFinishedId] = useState<string | null>(null);
  const [logDate, setLogDate] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    persistence.save(data);
  }, [data, persistence]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => {
    const next = fn(structuredClone(d));
    if (next.active) next.active.lastActivityAt = Date.now(); // any change to the live workout counts as activity
    return next;
  }), []);
  const replace = useCallback((d: AppData) => setData(d), []);
  const reset = useCallback(() => setData(persistence.reset()), [persistence]);
  const go = useCallback((t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); }, []);

  return <Ctx.Provider value={{ data, update, replace, reset, tab, go, finishedId, setFinishedId, logDate, setLogDate }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}

// Account info for cloud mode; null in on-device mode.
export interface Account {
  email: string;
  displayName: string;
  sync: { subscribe: (fn: (s: string) => void) => () => void };
  signOut: () => Promise<void>;
  setDisplayName: (n: string) => Promise<string | null>;
  changePassword: (p: string) => Promise<string | null>;
}
export const AccountCtx = createContext<Account | null>(null);
export const useAccount = () => useContext(AccountCtx);
