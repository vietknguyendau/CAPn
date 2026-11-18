// Structured data models. Shaped so they map 1:1 onto future Supabase tables
// (users, workouts, exercise_logs, sets, check_ins, bodyweight).

export type WeightUnit = 'lb' | 'kg' | 'machine';
export type Difficulty = 'easy' | 'moderate' | 'hard' | 'failed';
export type ExerciseKind = 'strength' | 'timed' | 'cardio';
export type Role = 'warmup' | 'main' | 'finisher';
export type TemplateId = 'full' | 'quick';
export type BodyPart = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'glutes' | 'core' | 'cardio' | 'sports' | 'mobility';
export type Activity = 'strength' | 'walk' | 'light' | 'recreation' | 'recovery' | 'rest';

export interface SetLog {
  id: string;
  weight: number | null;      // null = not recorded. Never guessed.
  unit: WeightUnit;
  unitConfirmed: boolean;     // false = unit label unverified (e.g. machine stack numbers)
  reps: number | null;        // null = not recorded
  durationSec: number | null; // timed holds like planks
  difficulty: Difficulty | null;
  completed: boolean;
  note?: string;
}

export interface CardioLog {
  speedMph: number | null;
  inclinePct: number | null;
  durationMin: number | null;
  completed: boolean;
  effort?: Difficulty | null; // how hard it felt (sports and cardio)
  note?: string;
}

// A timed block: Tabata, HIIT circuit, EMOM or AMRAP.
export interface IntervalSpec {
  format: 'tabata' | 'hiit' | 'emom' | 'amrap';
  name: string;
  workSec: number;      // tabata/hiit: work per move; emom: 60; amrap: total time
  restSec: number;
  rounds: number;       // tabata: number of work intervals; hiit: rounds through all moves; emom: minutes; amrap: 1
  moves: string[];      // exercise ids
  reps?: string[];      // target per move ("10 reps"), for EMOM/AMRAP
  roundRestSec?: number;
}
export interface IntervalLog extends IntervalSpec {
  roundsDone: number | null;
  effort: Difficulty | null;
  completed: boolean;
  note?: string;
}

export interface ExerciseLog {
  id: string;
  exerciseId: string;
  role: Role;
  sets: SetLog[];
  cardio?: CardioLog;
  feedback?: string;
  skipped?: boolean;
  substitutedFor?: string;
  setsBefore?: number;  // working sets already done in this workout when this exercise started
  movedLater?: boolean; // pushed later in the workout (machine taken, etc.)
  lateBy?: number;      // sets more than usual done before it; set when it was noticeably later
  targetSets?: number;
  targetMinutes?: number;
  interval?: IntervalLog;
  hint?: string; // e.g. "12% incline, 3.0 mph"
}

export interface Workout {
  id: string;
  date: string; // YYYY-MM-DD local
  startedAt: string | null;
  endedAt: string | null;
  durationMin: number | null;
  activeSec?: number; // timed length, excluding pauses
  autoFinished?: boolean; // saved automatically after inactivity
  template: TemplateId | 'custom';
  title: string;
  plannedMin?: number; // time estimate when the session started
  exercises: ExerciseLog[];
  preCheckInId?: string;
  postCheckInId?: string;
  soreness: number | null; // 1–5
  notes?: string;
  seeded?: boolean;
  dataNotes?: string[]; // what was missing or estimated
}

export type CheckInContext = 'pre' | 'post' | 'daily';

export interface CheckIn {
  id: string;
  createdAt: string;
  date: string;
  context: CheckInContext;
  workoutId?: string;
  mood: number | null;       // 1–10
  energy: number | null;     // 1–5
  stress: number | null;     // 1–5
  motivation: number | null; // 1–5
  fatigue: number | null;    // 1–5
  note?: string;
}

// What a day of the week holds. Old plans stored a bare Activity string; those still load.
export type PlanRef = { type: 'template'; id: TemplateId } | { type: 'routine'; id: string } | { type: 'program'; id: string };
export type DayPlan =
  | { kind: 'rest'; label?: string }
  | { kind: 'workout'; ref: PlanRef; label?: string }
  | { kind: 'activity'; label: string };

// Personal goal: drives plan recommendations and the progress card.
export type GoalFocus = 'lose' | 'muscle' | 'strength' | 'endurance' | 'mood' | 'mobility' | 'sport';
export interface Goal {
  createdAt: string;
  startDate: string;
  startWeight: number;
  targetWeight: number | null;
  unit: 'lb' | 'kg';
  focus: GoalFocus[];            // first = main focus
  experience: 'new' | 'returning' | 'regular';
  daysPerWeek: number;           // 2–6
  minutes: number;               // per session
  equipment: 'gym' | 'dumbbells' | 'none';
  sports: string[];
  pace: 'gentle' | 'steady';
  appliedPlan?: string;
}

export interface TimeWindow { id: 'A' | 'B' | 'C'; label: string; start: string; end: string }
export interface EquipmentPref { unit: WeightUnit; confirmed: boolean }

export interface Settings {
  defaultUnit: 'lb' | 'kg';
  windows: TimeWindow[];
  weeklyPlan: (DayPlan | Activity)[]; // index 0 = Monday
  overrides: Record<string, DayPlan | Activity>; // one-off changes by date
  equipment: Record<string, EquipmentPref>;
  notifications: { reminders: boolean; checkIns: boolean; weeklySummary: boolean };
  goals: string[];
  trackBodyweight: boolean;
  restSec: number;
  nutrition?: NutritionSettings;
  goal?: Goal;
  mealPlan?: import('./lib/mealplan').MealPlan;
}

export interface BodyweightEntry { id: string; date: string; value: number; unit: 'lb' | 'kg' }

export interface ActiveSession {
  workout: Workout;
  index: number;
  phase: 'pre' | 'exercise' | 'post';
  restEndsAt: number | null;
  backfill?: boolean; // logging a workout from an earlier day
  editingId?: string; // re-opened a saved workout to edit it
  pausedAt?: number | null; // workout clock paused at (ms)
  pausedMs?: number;        // total time spent paused
  lastActivityAt?: number;  // last tap or logged change (ms), for auto-finish
}

export interface PlanItem { exerciseId: string; sets: number; minutes?: number }

export interface BuilderDraft { items: PlanItem[]; warmup: boolean; cooldown: boolean }

export interface Routine extends BuilderDraft { id: string; name: string; createdAt: string }

// One day of wearable stats (from Fitbit via the Google Health API). id = date.
export interface HealthDay {
  id: string;
  date: string;              // local date the night's sleep ended / the day the stats belong to
  sleepMin: number | null;   // minutes asleep (main sleep)
  deepMin: number | null;
  remMin: number | null;
  lightMin: number | null;
  awakeMin: number | null;
  restingHr: number | null;  // bpm
  steps: number | null;
  caloriesOut?: number | null; // total burned (resting + activity), kcal
  activeKcal?: number | null;  // activity-only kcal
  source: 'fitbit';
  syncedAt: string;
}

// An exercise or activity the person added themselves. Never deleted once used: archived instead.
export interface CustomExercise {
  id: string;               // "custom-…"
  name: string;
  kind: ExerciseKind;       // strength (weight × reps), timed (holds), cardio (minutes: also sports)
  parts: BodyPart[];
  equipment: string;
  perHand?: boolean;
  unilateral?: boolean;
  bodyweight?: boolean;
  repRange?: [number, number];
  targetSec?: number;
  defaultMinutes?: number;
  restSec: number;
  defaultUnit: WeightUnit;
  archived?: boolean;
  createdAt: string;
}

// ── Nutrition ──
export interface Macros { kcal: number; protein: number; carbs: number; fat: number; fiber: number | null; sugar: number | null; sodiumMg: number | null }
export interface Serving { label: string; grams: number }
export interface Food {
  id: string;                 // fdc-…, off-…, custom-…
  name: string;
  brand?: string;
  per100g: Macros;
  servings: Serving[];
  source: 'usda' | 'off' | 'custom' | 'recipe';
  barcode?: string;
  favorite?: boolean;
  lastUsed?: string;
  recipe?: RecipeInfo;
}
export interface RecipeInfo {
  image: string | null; readyInMinutes: number | null; servings: number; sourceUrl: string | null;
  ingredients: string[]; steps: string[]; perServing: Macros;
}
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export interface FoodLogEntry {
  id: string;
  date: string;
  meal: Meal;
  foodId: string | null;      // null for quick add
  name: string;
  brand?: string;
  servingLabel: string;
  grams: number;              // grams per serving
  quantity: number;           // number of servings
  per100g: Macros;            // snapshot, so old logs never change
  totals: Macros;
  createdAt: string;
}
export interface NutritionSettings {
  showCalories: boolean;
  targets: { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };
}

export interface AppData {
  version: 1;
  workouts: Workout[];
  checkIns: CheckIn[];
  bodyweight: BodyweightEntry[];
  settings: Settings;
  active: ActiveSession | null;
  routines: Routine[];
  draft: BuilderDraft;
  healthDays: HealthDay[];
  customExercises: CustomExercise[];
  foods: Food[];
  foodLogs: FoodLogEntry[];
}
