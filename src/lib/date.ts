const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const parseISO = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const dayIdx = (d: Date) => (d.getDay() + 6) % 7; // 0 = Monday
export const weekStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return addDays(x, -dayIdx(x)); };
export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const fmtShort = (s: string) => parseISO(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtLong = (s: string) => parseISO(s).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
export const toMinutes = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fmtTime = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  const hr = ((h + 11) % 12) + 1;
  return `${hr}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
};
