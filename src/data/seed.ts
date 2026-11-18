import type { AppData, CheckIn, SetLog, Settings, Workout } from '../types';

// Seed: the November 2, 2026 baseline. Only confirmed values are filled in;
// anything not recorded is stored as null and listed in dataNotes.

let n = 0;
const sid = (p: string) => `seed-${p}-${++n}`;
const S = (p: Partial<SetLog>): SetLog => ({
  id: sid('set'), weight: null, unit: 'lb', unitConfirmed: true, reps: null,
  durationSec: null, difficulty: null, completed: true, ...p,
});

const POST_ID = 'seed-checkin-post-2026-11-02';
const WORKOUT_ID = 'seed-workout-2026-11-02';

export const seedWorkout: Workout = {
  id: WORKOUT_ID,
  date: '2026-11-02',
  startedAt: null,
  endedAt: null,
  durationMin: null,
  template: 'full',
  title: 'Full-body strength + cardio',
  seeded: true,
  postCheckInId: POST_ID,
  soreness: null,
  notes: 'Felt better than before the workout. Comfortable, not exhausted.',
  dataNotes: [
    'Workout duration not recorded.',
    'Leg press reps not recorded.',
    'Chest press set 2 not confirmed.',
    'Seated row logged in machine units; lb vs kg unverified.',
    'Plank durations not recorded.',
    'Treadmill durations not recorded.',
    'No pre-workout mood was logged.',
  ],
  exercises: [
    { id: sid('ex'), exerciseId: 'treadmill', role: 'warmup', sets: [],
      cardio: { speedMph: null, inclinePct: null, durationMin: null, completed: true, note: 'Warm-up completed; settings not recorded' } },
    { id: sid('ex'), exerciseId: 'leg-press', role: 'main', feedback: 'Good stretch and controlled movement',
      sets: [S({ weight: 90 }), S({ weight: 140 })] },
    { id: sid('ex'), exerciseId: 'chest-press', role: 'main', feedback: 'Moderate difficulty',
      sets: [S({ weight: 60, difficulty: 'moderate' }), S({ completed: false, note: 'Set 2 not confirmed' })] },
    { id: sid('ex'), exerciseId: 'lat-pulldown', role: 'main', feedback: 'First set too easy; second challenging',
      sets: [S({ weight: 60, reps: 12, difficulty: 'easy' }), S({ weight: 90, reps: 12, difficulty: 'hard' })] },
    { id: sid('ex'), exerciseId: 'seated-row', role: 'main', feedback: 'Comfortable, manageable',
      sets: [S({ weight: 27.5, unit: 'machine', unitConfirmed: false }), S({ weight: 35, unit: 'machine', unitConfirmed: false })] },
    { id: sid('ex'), exerciseId: 'db-shoulder-press', role: 'main', feedback: 'Second set still slightly easy',
      sets: [S({ weight: 17.5, reps: 10 }), S({ weight: 25, reps: 10, difficulty: 'easy' })] },
    { id: sid('ex'), exerciseId: 'plank', role: 'main', feedback: 'Completed; duration not recorded',
      sets: [S({}), S({})] },
    { id: sid('ex'), exerciseId: 'treadmill', role: 'finisher', sets: [],
      cardio: { speedMph: 3.3, inclinePct: 1.5, durationMin: null, completed: true, note: 'Comfortable' } },
  ],
};

export const seedCheckIns: CheckIn[] = [
  {
    id: POST_ID, createdAt: '2026-11-02T12:00:00', date: '2026-11-02', context: 'post', workoutId: WORKOUT_ID,
    mood: 8, energy: null, stress: null, motivation: null, fatigue: null,
    note: 'Mentally better than before the workout. Physically comfortable, not exhausted.',
  },
];

export const defaultSettings: Settings = {
  defaultUnit: 'lb',
  windows: [
    { id: 'A', label: 'Plan A', start: '06:30', end: '07:30' },
    { id: 'B', label: 'Plan B', start: '10:00', end: '11:00' },
    { id: 'C', label: 'Plan C', start: '15:00', end: '16:00' },
  ],
  weeklyPlan: [
    { kind: 'workout', ref: { type: 'template', id: 'full' } },
    { kind: 'activity', label: 'Walk' },
    { kind: 'workout', ref: { type: 'template', id: 'full' } },
    { kind: 'activity', label: 'Light cardio' },
    { kind: 'workout', ref: { type: 'template', id: 'full' } },
    { kind: 'activity', label: 'Play' },
    { kind: 'rest', label: 'Recovery' },
  ],
  overrides: {},
  equipment: { 'seated-row': { unit: 'machine', confirmed: false } },
  notifications: { reminders: true, checkIns: true, weeklySummary: false },
  goals: [
    'Improve mental well-being through exercise',
    'Establish a sustainable workout routine',
    'Rebuild strength and muscle',
    'Improve energy and productivity',
    'Gradually improve body composition',
  ],
  trackBodyweight: false,
  restSec: 90,
};

export const seedData = (): AppData => ({
  version: 1,
  workouts: [structuredClone(seedWorkout)],
  checkIns: structuredClone(seedCheckIns),
  bodyweight: [],
  settings: structuredClone(defaultSettings),
  active: null,
  routines: [],
  draft: { items: [], warmup: true, cooldown: true },
  healthDays: [],
  customExercises: [],
  foods: [],
  foodLogs: [],
});

// New accounts start with no history; the Nov 2 baseline belongs to the original owner.
export const emptyData = (): AppData => ({ ...seedData(), workouts: [], checkIns: [] });
