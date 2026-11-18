import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Screen({ title, sub, right, children }: { title: string; sub?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 pb-32 pt-safe">
      <header className="flex items-end justify-between gap-3 pb-5 pt-4">
        <div>
          {sub && <p className="text-sm text-haze">{sub}</p>}
          <h1 className="font-display text-4xl font-semibold leading-none tracking-tight">{title}</h1>
        </div>
        {right}
      </header>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function Panel({ children, className, tone }: { children: ReactNode; className?: string; tone?: 'sun' | 'tide' }) {
  return (
    <section className={cx('rounded-2xl border bg-deck p-4',
      tone === 'sun' ? 'border-sun/40' : tone === 'tide' ? 'border-tide/40' : 'border-rim', className)}>
      {children}
    </section>
  );
}

export function H2({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-2">
      <h2 className="font-display text-xl font-semibold">{children}</h2>
      {aside && <span className="text-sm text-haze">{aside}</span>}
    </div>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'quiet' | 'tide'; size?: 'md' | 'lg' };
export function Btn({ variant = 'primary', size = 'md', className, ...p }: BtnProps) {
  return (
    <button
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors disabled:opacity-40',
        size === 'lg' ? 'min-h-[56px] px-6 text-lg' : 'min-h-[44px] px-4',
        variant === 'primary' && 'bg-sun text-ink active:bg-sun/80',
        variant === 'tide' && 'bg-tide text-ink active:bg-tide/80',
        variant === 'ghost' && 'border border-rim text-chalk active:bg-rim/60',
        variant === 'quiet' && 'text-haze active:text-chalk',
        className,
      )}
    />
  );
}

export function Stepper({ label, value, onChange, step, suffix, min = 0, decimals = true }: {
  label: string; value: number | null; onChange: (v: number | null) => void; step: number; suffix?: string; min?: number; decimals?: boolean;
}) {
  const bump = (d: number) => onChange(Math.max(min, Math.round(((value ?? 0) + d) * 10) / 10));
  return (
    <div className="flex-1">
      <p className="mb-1 text-sm text-haze">{label}</p>
      <div className="flex items-center gap-2">
        <button aria-label={`Decrease ${label}`} onClick={() => bump(-step)}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-rim active:bg-rim"><Minus size={22} /></button>
        <label className="flex min-w-0 flex-1 flex-col items-center">
          <input
            inputMode={decimals ? 'decimal' : 'numeric'} type="number" aria-label={label}
            value={value ?? ''} placeholder="–"
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
            className="w-full bg-transparent text-center font-display text-6xl font-semibold leading-none text-chalk outline-none placeholder:text-rim"
          />
          {suffix && <span className="text-sm text-haze">{suffix}</span>}
        </label>
        <button aria-label={`Increase ${label}`} onClick={() => bump(step)}
          className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-rim active:bg-rim"><Plus size={22} /></button>
      </div>
    </div>
  );
}

export function Scale({ value, onChange, max = 10, label, lowHint, highHint, tone = 'tide' }: {
  value: number | null; onChange: (v: number | null) => void; max?: number; label: string; lowHint?: string; highHint?: string; tone?: 'tide' | 'sun';
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm text-haze">{label}</legend>
      <div className={cx('grid gap-1.5', max === 10 ? 'grid-cols-10' : 'grid-cols-5')}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button key={n} aria-pressed={value === n} onClick={() => onChange(value === n ? null : n)}
            className={cx('h-11 rounded-lg border font-display text-lg font-semibold',
              value === n ? (tone === 'tide' ? 'border-tide bg-tide text-ink' : 'border-sun bg-sun text-ink') : 'border-rim text-haze active:bg-rim')}>
            {n}
          </button>
        ))}
      </div>
      {(lowHint || highHint) && (
        <div className="mt-1 flex justify-between text-xs text-haze"><span>{lowHint}</span><span>{highHint}</span></div>
      )}
    </fieldset>
  );
}

export function Chips<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={cx('min-h-[44px] rounded-full border px-4 text-sm font-semibold',
            value === o.value ? 'border-sun bg-sun text-ink' : 'border-rim text-chalk active:bg-rim')}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-center justify-between gap-4 py-1">
      <span><span className="block">{label}</span>{hint && <span className="block text-sm text-haze">{hint}</span>}</span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-rim transition-colors peer-checked:bg-tide peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-sun
        after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-chalk after:transition-transform peer-checked:after:translate-x-5" />
    </label>
  );
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'sun' | 'tide' | 'flare' }) {
  return (
    <span className={cx('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
      tone === 'muted' && 'bg-rim text-haze', tone === 'sun' && 'bg-sun/15 text-sun',
      tone === 'tide' && 'bg-tide/15 text-tide', tone === 'flare' && 'bg-flare/15 text-flare')}>{children}</span>
  );
}
