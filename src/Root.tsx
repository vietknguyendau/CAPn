import { useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import App from './App';
import { AccountCtx, StoreProvider, type Account } from './store';
import { localRepository, hasLegacyData, LEGACY_KEY } from './lib/storage';
import { CloudSync, authLinkType, cloudEnabled, fetchAll, supabase } from './lib/cloud';
import { emptyData } from './data/seed';
import type { AppData } from './types';
import { AuthScreen, SetPassword, Splash } from './screens/Auth';
import { Btn } from './components/ui';
import { FitbitProvider } from './components/FitbitProvider';

export default function Root() {
  if (!cloudEnabled) {
    // On-device mode: no accounts, data stays in this browser.
    return <StoreProvider initial={localRepository.load()} persistence={localRepository}><App /></StoreProvider>;
  }
  return <CloudRoot />;
}

function CloudRoot() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [linkType, setLinkType] = useState(authLinkType);

  useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase!.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setLinkType('recovery');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <Splash text="Loading…" />;
  if (session && linkType) return <SetPassword kind={linkType} onDone={() => setLinkType(null)} />;
  if (!session) return <AuthScreen />;
  return <UserBoot key={session.user.id} session={session} />;
}

type Boot =
  | { stage: 'loading' }
  | { stage: 'migrate'; legacy: AppData; base: AppData; remote: AppData | null; fresh: { workouts: number; checkIns: number; routines: number } }
  | { stage: 'ready'; data: AppData; synced: AppData | null; offline: boolean }
  | { stage: 'error'; message: string };

function UserBoot({ session }: { session: Session }) {
  const userId = session.user.id;
  const [boot, setBoot] = useState<Boot>({ stage: 'loading' });

  const dismissKey = `momentum:legacy-dismissed:${userId}`;
  const load = async () => {
    setBoot({ stage: 'loading' });
    const cache = CloudSync.readCache(userId);
    try {
      const remote = await fetchAll(userId);
      if (cache && JSON.stringify(cache.data) !== JSON.stringify(cache.synced)) {
        // Edits were made offline last time: keep them and push.
        setBoot({ stage: 'ready', data: cache.data, synced: remote, offline: false });
        return;
      }
      // Pre-account data on this device that isn't in the account yet? Offer to merge it in.
      const legacy = hasLegacyData();
      let dismissed = false;
      try { dismissed = localStorage.getItem(dismissKey) === '1'; } catch { /* ignore */ }
      if (legacy && !dismissed) {
        const base = remote ?? emptyData();
        const fresh = newItems(legacy, base);
        if (fresh.workouts + fresh.checkIns + fresh.routines > 0) { setBoot({ stage: 'migrate', legacy, base, remote, fresh }); return; }
      }
      setBoot({ stage: 'ready', data: remote ?? emptyData(), synced: remote, offline: false });
    } catch (e) {
      if (cache) setBoot({ stage: 'ready', data: cache.data, synced: cache.synced, offline: true });
      else setBoot({ stage: 'error', message: (e as Error).message });
    }
  };
  useEffect(() => { load(); }, [userId]);

  if (boot.stage === 'loading') return <Splash />;
  if (boot.stage === 'error') return (
    <div className="mx-auto max-w-sm px-5 py-16">
      <h1 className="font-display text-3xl font-semibold">Couldn’t load your data</h1>
      <p className="mt-2 text-haze">Check your connection and try again. ({boot.message})</p>
      <div className="mt-4 flex gap-2"><Btn onClick={load}>Try again</Btn><Btn variant="ghost" onClick={() => supabase!.auth.signOut()}>Sign out</Btn></div>
    </div>
  );
  if (boot.stage === 'migrate') {
    const { legacy, base, remote, fresh } = boot;
    const parts = [
      fresh.workouts && `${fresh.workouts} workout${fresh.workouts === 1 ? '' : 's'}`,
      fresh.checkIns && `${fresh.checkIns} check-in${fresh.checkIns === 1 ? '' : 's'}`,
      fresh.routines && `${fresh.routines} routine${fresh.routines === 1 ? '' : 's'}`,
    ].filter(Boolean).join(', ');
    return (
      <div className="mx-auto max-w-sm px-5 py-16 pt-safe">
        <h1 className="font-display text-4xl font-semibold leading-tight">Bring your history?</h1>
        <p className="mt-3">This device has {parts} saved from before accounts.</p>
        <p className="mt-2 text-haze">Add them to {session.user.email}? Anything already in your account stays. Only do this if they’re yours.</p>
        <div className="mt-6 grid gap-2">
          <Btn size="lg" onClick={() => {
            try { localStorage.removeItem(LEGACY_KEY); } catch { /* ignore */ }
            setBoot({ stage: 'ready', data: mergeData(base, legacy, !remote), synced: remote, offline: false });
          }}>Add to my account</Btn>
          <Btn size="lg" variant="ghost" onClick={() => {
            try { localStorage.setItem(dismissKey, '1'); } catch { /* ignore */ }
            setBoot({ stage: 'ready', data: base, synced: remote, offline: false });
          }}>Not now</Btn>
        </div>
      </div>
    );
  }
  return <Ready session={session} data={boot.data} synced={boot.synced} />;
}

function Ready({ session, data, synced }: { session: Session; data: AppData; synced: AppData | null }) {
  const sync = useMemo(() => new CloudSync(session.user.id, data, synced), [session.user.id]);
  const [displayName, setName] = useState<string>((session.user.user_metadata?.display_name as string) ?? '');
  useEffect(() => { sync.start(); return () => sync.dispose(); }, [sync]);

  const account: Account = {
    email: session.user.email ?? '',
    displayName,
    sync: { subscribe: (fn) => sync.subscribe(fn) },
    signOut: async () => {
      await sync.flush();
      if (sync.status === 'synced') sync.clearCache(); // don't leave data behind on shared devices
      await supabase!.auth.signOut();
    },
    setDisplayName: async (n) => {
      const { error } = await supabase!.auth.updateUser({ data: { display_name: n } });
      if (error) return error.message;
      await supabase!.from('profiles').upsert({ id: session.user.id, display_name: n });
      setName(n); return null;
    },
    changePassword: async (p) => {
      const { error } = await supabase!.auth.updateUser({ password: p });
      return error ? error.message : null;
    },
  };

  return (
    <AccountCtx.Provider value={account}>
      <StoreProvider initial={data} persistence={sync}><FitbitProvider><App /></FitbitProvider></StoreProvider>
    </AccountCtx.Provider>
  );
}

type Col = 'workouts' | 'checkIns' | 'bodyweight' | 'routines';
const COLS: Col[] = ['workouts', 'checkIns', 'bodyweight', 'routines'];

function newItems(from: AppData, into: AppData) {
  const count = (c: Col) => { const have = new Set((into[c] as { id: string }[]).map((x) => x.id)); return (from[c] as { id: string }[]).filter((x) => !have.has(x.id)).length; };
  return { workouts: count('workouts'), checkIns: count('checkIns'), routines: count('routines') };
}

/** Union by id; records already in the account win. Settings come from the device only for a brand-new account. */
function mergeData(base: AppData, add: AppData, takeSettings: boolean): AppData {
  const out = structuredClone(base);
  for (const c of COLS) {
    const have = new Set((out[c] as { id: string }[]).map((x) => x.id));
    (out[c] as unknown[]).push(...(add[c] as { id: string }[]).filter((x) => !have.has(x.id)));
  }
  if (takeSettings) { out.settings = add.settings; out.draft = add.draft; }
  out.active = base.active;
  return out;
}
