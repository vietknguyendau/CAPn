import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/cloud';
import { Btn, cx } from '../components/ui';

const field = 'min-h-[52px] w-full rounded-xl border border-rim bg-deck px-4 text-chalk outline-none focus:border-sun';

function friendly(msg: string) {
  if (/signups? not allowed|signup is disabled/i.test(msg)) return 'Sign-ups are invite-only. Ask the owner to send you an invite.';
  if (/invalid login credentials/i.test(msg)) return 'That email and password don’t match. Check both, or reset your password.';
  if (/email not confirmed/i.test(msg)) return 'Confirm your email first. Check your inbox for the link.';
  if (/rate limit/i.test(msg)) return 'Too many emails sent recently. Wait a few minutes and try again.';
  return msg;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-full max-w-sm flex-col justify-center px-5 py-10 pt-safe">
      <h1 className="font-display text-6xl font-bold leading-none tracking-tight">Momentum</h1>
      <p className="mt-2 text-haze">Show up. Build momentum. Feel better.</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function AuthScreen() {
  const [mode, setMode] = useState<'in' | 'up' | 'forgot'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    const redirect = window.location.origin;
    try {
      if (mode === 'in') {
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === 'up') {
        const { data, error } = await supabase!.auth.signUp({ email, password, options: { data: { display_name: name.trim() }, emailRedirectTo: redirect } });
        if (error) throw error;
        if (!data.session) setNotice(`Check ${email} for a confirmation link, then sign in.`);
      } else {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: redirect });
        if (error) throw error;
        setNotice(`If ${email} has an account, a reset link is on its way.`);
      }
    } catch (err) {
      setError(friendly((err as Error).message));
    } finally { setBusy(false); }
  };

  return (
    <Shell>
      {mode !== 'forgot' && (
        <div className="mb-5 grid grid-cols-2 rounded-xl border border-rim p-1" role="tablist">
          {(['in', 'up'] as const).map((m) => (
            <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setError(null); setNotice(null); }}
              className={cx('min-h-[44px] rounded-lg font-semibold', mode === m ? 'bg-sun text-ink' : 'text-haze')}>
              {m === 'in' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>
      )}
      {mode === 'forgot' && <h2 className="mb-4 font-display text-2xl font-semibold">Reset your password</h2>}
      <form onSubmit={submit} className="space-y-3">
        {mode === 'up' && (
          <label className="block"><span className="mb-1 block text-sm text-haze">Your name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" required /></label>
        )}
        <label className="block"><span className="mb-1 block text-sm text-haze">Email</span>
          <input className={field} type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        {mode !== 'forgot' && (
          <label className="block"><span className="mb-1 block text-sm text-haze">Password{mode === 'up' ? ' (at least 8 characters)' : ''}</span>
            <input className={field} type="password" minLength={mode === 'up' ? 8 : undefined} autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        )}
        {error && <p className="text-sm text-flare" role="alert">{error}</p>}
        {notice && <p className="text-sm text-tide" role="status">{notice}</p>}
        <Btn type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : mode === 'up' ? 'Create account' : 'Send reset link'}
        </Btn>
      </form>
      <div className="mt-4 text-center">
        {mode === 'in' && <button className="min-h-[44px] text-sm text-haze underline underline-offset-4" onClick={() => { setMode('forgot'); setError(null); }}>Forgot password?</button>}
        {mode === 'forgot' && <button className="min-h-[44px] text-sm text-haze underline underline-offset-4" onClick={() => { setMode('in'); setNotice(null); }}>Back to sign in</button>}
      </div>
    </Shell>
  );
}

export function SetPassword({ kind, onDone }: { kind: 'invite' | 'recovery'; onDone: () => void }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null);
    const { data, error } = await supabase!.auth.updateUser({ password, ...(kind === 'invite' && name.trim() ? { data: { display_name: name.trim() } } : {}) });
    if (!error && kind === 'invite' && name.trim() && data.user) await supabase!.from('profiles').upsert({ id: data.user.id, display_name: name.trim() });
    setBusy(false);
    if (error) setError(friendly(error.message)); else { history.replaceState(null, '', window.location.pathname); onDone(); }
  };
  return (
    <Shell>
      <h2 className="mb-4 font-display text-2xl font-semibold">{kind === 'invite' ? 'Welcome. Set up your account' : 'Choose a new password'}</h2>
      <form onSubmit={submit} className="space-y-3">
        {kind === 'invite' && (
          <label className="block"><span className="mb-1 block text-sm text-haze">Your name</span>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></label>
        )}
        <label className="block"><span className="mb-1 block text-sm text-haze">New password (at least 8 characters)</span>
          <input className={field} type="password" minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        {error && <p className="text-sm text-flare" role="alert">{error}</p>}
        <Btn type="submit" size="lg" className="w-full" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</Btn>
      </form>
    </Shell>
  );
}

export function Splash({ text = 'Loading your workouts…' }: { text?: string }) {
  return <Shell><p className="text-haze" role="status">{text}</p></Shell>;
}
