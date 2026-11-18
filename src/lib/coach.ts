import type { AppData, Difficulty, Workout } from '../types';
import { EXERCISES, TEMPLATES, findExerciseInText, unitLabel } from '../data/exercises';
import { addDays, DAY_NAMES, dayIdx, fmtLong, parseISO, toISO } from './date';
import { fmtRec, nextSetTip, recommend } from './progression';

// Rule-based coach that only answers from saved records.
// Later: replace `respond` with a call to a secure backend that passes the same
// history to an LLM. Keep the "never invent history" rule in that prompt.

export type CoachAction = 'start-quick' | 'start-full';
export interface CoachReply { text: string; actions?: CoachAction[] }

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseDate(t: string, now: Date): string | 'last' | null {
  if (/\b(last (time|workout|session)|most recent|previous workout)\b/.test(t)) return 'last';
  if (/\byesterday\b/.test(t)) return toISO(addDays(now, -1));
  if (/\btoday\b/.test(t)) return toISO(now);
  const dayMatch = DAY_NAMES.findIndex((d) => t.includes(d.toLowerCase()));
  if (dayMatch >= 0) {
    let diff = (dayIdx(now) - dayMatch + 7) % 7;
    if (diff === 0 || /\blast\b/.test(t)) diff = diff === 0 ? 7 : diff;
    return toISO(addDays(now, -diff));
  }
  const m = t.match(new RegExp(`\\b(${MONTHS.join('|')})[a-z]*\\.?\\s+(\\d{1,2})\\b`));
  if (m) {
    const month = MONTHS.indexOf(m[1]);
    let year = now.getFullYear();
    if (new Date(year, month, Number(m[2])) > now) year--;
    return toISO(new Date(year, month, Number(m[2])));
  }
  const num = t.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (num) {
    let year = now.getFullYear();
    if (new Date(year, Number(num[1]) - 1, Number(num[2])) > now) year--;
    return toISO(new Date(year, Number(num[1]) - 1, Number(num[2])));
  }
  return null;
}

export function summarizeWorkout(w: Workout): string {
  const lines = w.exercises.filter((e) => !e.skipped).map((e) => {
    const def = EXERCISES[e.exerciseId];
    const name = def?.name ?? e.exerciseId;
    if (e.interval) {
      const iv = e.interval;
      const moves = iv.moves.map((m) => EXERCISES[m]?.name ?? m).join(', ');
      return `• ${iv.name}: ${iv.format.toUpperCase()} (${moves})${iv.roundsDone != null ? `, ${iv.roundsDone} done` : ''}${iv.effort ? `, felt ${iv.effort}` : ''}`;
    }
    if (e.cardio) {
      const c = e.cardio;
      const parts = [c.speedMph != null ? `${c.speedMph} mph` : null, c.inclinePct != null ? `${c.inclinePct}% incline` : null,
        c.durationMin != null ? `${c.durationMin} min` : null].filter(Boolean);
      return `• ${name}${e.role === 'warmup' ? ' (warm-up)' : e.role === 'finisher' ? ' (finisher)' : ''}: ${parts.length ? parts.join(', ') : 'completed, details not recorded'}`;
    }
    const sets = e.sets.map((s) => {
      if (!s.completed) return s.note ?? 'not confirmed';
      if (def?.kind === 'timed') return s.durationSec != null ? `${s.durationSec} sec` : 'done (time not recorded)';
      const w = s.weight != null ? `${s.weight} ${unitLabel(s.unit)}${def?.perHand ? ' each' : ''}${s.unitConfirmed ? '' : ' (unit unverified)'}` : 'weight not recorded';
      return `${w}${s.reps != null ? ` × ${s.reps}` : ''}`;
    });
    return `• ${name}: ${sets.join(', ') || 'no sets logged'}`;
  });
  const missing = w.dataNotes?.length ? `\n\nNot recorded: ${w.dataNotes.join(' ')}` : '';
  return `${fmtLong(w.date)} — ${w.title}\n${lines.join('\n')}${missing}`;
}

export function respond(input: string, data: AppData, now = new Date()): CoachReply {
  const t = input.toLowerCase().trim();

  if (/(suicid|kill myself|end my life|end it all|self[- ]?harm|hurt myself|don'?t want to (be here|live))/.test(t)) {
    return { text: 'I’m really glad you said something. I’m a workout coach, not the right support for this, but you deserve real support right now. In the US you can call or text 988 to reach the Suicide & Crisis Lifeline any time. If you’re in immediate danger, call 911. Reaching out to someone you trust tonight could help too.' };
  }

  if (/(overwhelm|stressed|anxious|exhausted|burn(ed|t)? ?out|no energy|unmotivated|rough day|bad day|tired|not feeling it|low today)/.test(t)) {
    return {
      text: 'Thanks for telling me. Let’s keep it light: a 15-minute reset is enough today. Getting some movement in counts. If even that feels like too much, a 10-minute walk or rest is a fine call.\n\nIf heavy days keep stacking up, it’s worth talking with someone you trust or a professional. I can help with training, not with everything.',
      actions: ['start-quick'],
    };
  }

  if (/\bsore|soreness|aching|hurts?\b|pain\b/.test(t)) {
    const sharp = /\bpain|sharp|injur|swell/.test(t);
    return { text: sharp
      ? 'Sharp or joint pain is different from normal soreness. Skip anything that aggravates it, and check with a doctor or physical therapist if it lingers. I’m not able to diagnose it.'
      : 'Normal muscle soreness usually eases in 1–3 days. Easy walking, mobility work, sleep, and protein help. If you’re still sore on a strength day, keep the same weights rather than adding more, or do the 15-minute version.' };
  }

  const exId = findExerciseInText(t);
  const num = t.match(/(\d+(?:\.\d+)?)\s*(lbs?|pounds?|kg|kilos?|units?)?/);
  const diff: Difficulty | null = /\b(easy|light|too easy)\b/.test(t) ? 'easy'
    : /\b(moderate|okay|ok|fine|solid|manageable)\b/.test(t) ? 'moderate'
    : /\b(couldn'?t|failed|form broke|struggled to finish)\b/.test(t) ? 'failed'
    : /\b(hard|tough|heavy|challenging|difficult)\b/.test(t) ? 'hard' : null;

  // "I just did 60 lbs on chest press. It was easy."
  if (exId && num && /\b(did|lifted|just|hit|pressed|pulled|went)\b/.test(t)) {
    const def = EXERCISES[exId];
    const unit = num[2]?.startsWith('kg') || num[2]?.startsWith('kilo') ? 'kg' : num[2]?.startsWith('unit') ? 'machine' : (data.settings.equipment[exId]?.unit ?? 'lb');
    const tip = nextSetTip(exId, { id: 'x', weight: Number(num[1]), unit, unitConfirmed: true, reps: null, durationSec: null, difficulty: diff, completed: true });
    return { text: diff ? tip.text : `Got it: ${num[1]} ${unitLabel(unit)} on ${def.name.toLowerCase()}. How did it feel: easy, moderate, or hard? Rate it in the workout screen and I’ll tune your next set.` };
  }

  // History lookups
  if (/\b(what|show|how much|did i)\b.*\b(lift|lifted|do|did|train|trained|workout)\b|\bhistory\b/.test(t)) {
    const when = parseDate(t, now);
    const sorted = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.endedAt ?? '').localeCompare(a.endedAt ?? ''));
    let found: Workout[] = [];
    let label = '';
    if (when === 'last' || (!when && sorted.length)) { found = sorted.slice(0, 1); label = 'your most recent workout'; }
    else if (when) { found = sorted.filter((w) => w.date === when); label = fmtLong(when); }
    if (!found.length) {
      return { text: `I don’t have a workout logged for ${label || 'that day'}. I only report what’s saved, so I won’t guess.${sorted[0] ? ` Your most recent one is ${fmtLong(sorted[0].date)}.` : ''}` };
    }
    if (exId) {
      const w = found[0];
      const log = w.exercises.find((e) => e.exerciseId === exId);
      if (!log) return { text: `${EXERCISES[exId].name} isn’t in ${label}’s log.` };
      return { text: summarizeWorkout({ ...w, exercises: [log], dataNotes: [] }) };
    }
    return { text: found.map(summarizeWorkout).join('\n\n') };
  }

  // Recommendations
  if (/\b(next|should i|recommend|suggest|what weight|how much should)\b/.test(t)) {
    const ids = exId ? [exId] : TEMPLATES.full.items.filter((i) => i.role === 'main').map((i) => i.exerciseId);
    const lines = ids.map((id) => {
      const r = recommend(id, data);
      return `• ${EXERCISES[id].name}: ${fmtRec(r, EXERCISES[id].perHand)}${r.unit === 'machine' && !r.unitConfirmed ? ' (unit unverified)' : ''}`;
    });
    return { text: `Suggested starting points for next session. These are starting points, not orders. Adjust to how you feel on the day.\n${lines.join('\n')}`, actions: ['start-full'] };
  }

  if (/\b(rest day|rest|recover|recovery)\b/.test(t)) {
    return { text: 'Recovery days are where strength actually gets built. A walk, some stretching, good sleep and food all count. Aim for at least one easy day between strength sessions.' };
  }

  return { text: 'I can help with:\n• “What did I lift last Wednesday?”\n• “I just did 60 lb on chest press. It was easy.”\n• “What should I lift next session?”\n• “I feel overwhelmed today.”\n• “I’m sore — should I train?”' };
}

export const dateLabel = (iso: string) => fmtLong(iso) + (toISO(new Date()) === iso ? ' (today)' : '');
export { parseISO };
