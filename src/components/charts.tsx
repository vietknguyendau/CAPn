// Small dependency-free SVG charts.
export interface Series { values: (number | null)[]; color: string; label: string }

export function LineChart({ series, labels, min, max, height = 150, unit }: {
  series: Series[]; labels: string[]; min?: number; max?: number; height?: number; unit?: string;
}) {
  const all = series.flatMap((s) => s.values).filter((v): v is number => v != null);
  if (!all.length) return <p className="py-6 text-center text-sm text-haze">Not enough data yet.</p>;
  const lo = min ?? Math.floor(Math.min(...all) * 0.9);
  const hi = max ?? Math.ceil(Math.max(...all) * 1.1);
  const W = 320, H = height, P = 28;
  const n = Math.max(labels.length, 1);
  const x = (i: number) => (n === 1 ? W / 2 : P + (i * (W - P * 1.5)) / (n - 1));
  const y = (v: number) => H - 22 - ((v - lo) / (hi - lo || 1)) * (H - 36);
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={series.map((s) => s.label).join(', ')}>
        {[lo, (lo + hi) / 2, hi].map((g) => (
          <g key={g}>
            <line x1={P} x2={W} y1={y(g)} y2={y(g)} stroke="#26364F" strokeDasharray="3 4" />
            <text x={0} y={y(g) + 4} fill="#93A1B5" fontSize="10">{Math.round(g * 10) / 10}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)] as const)).filter(Boolean) as (readonly [number, number])[];
          return (
            <g key={s.label}>
              {pts.length > 1 && <polyline fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" points={pts.map((p) => p.join(',')).join(' ')} />}
              {pts.map(([px, py], i) => <circle key={i} cx={px} cy={py} r={4} fill={s.color} />)}
            </g>
          );
        })}
        {labels.map((l, i) => (n <= 8 || i % Math.ceil(n / 8) === 0) && (
          <text key={i} x={x(i)} y={H - 4} fill="#93A1B5" fontSize="10" textAnchor="middle">{l}</text>
        ))}
      </svg>
      {(series.length > 1 || unit) && (
        <figcaption className="mt-1 flex flex-wrap gap-3 text-xs text-haze">
          {series.length > 1 && series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
          ))}
          {unit && <span>{unit}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export function Bars({ values, labels, target, max }: { values: number[]; labels: string[]; target?: number; max?: number }) {
  const hi = max ?? Math.max(target ?? 0, ...values, 1);
  return (
    <div className="flex h-32 items-end gap-2" role="img" aria-label={`Workouts per week: ${values.join(', ')}`}>
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1">
          <span className="font-display text-sm text-chalk">{v}</span>
          <div className="relative w-full rounded-md bg-rim" style={{ height: 80 }}>
            <div className={`absolute bottom-0 w-full rounded-md ${target && v >= target ? 'bg-sun' : 'bg-sun/50'}`} style={{ height: `${(v / hi) * 100}%` }} />
            {target != null && <div className="absolute w-full border-t border-dashed border-chalk/50" style={{ bottom: `${(target / hi) * 100}%` }} />}
          </div>
          <span className="text-[10px] text-haze">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}
