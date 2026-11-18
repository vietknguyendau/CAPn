import type { BodyPart, CustomExercise, ExerciseKind, Role, TemplateId, WeightUnit } from '../types';

export interface ExerciseDef {
  id: string;
  name: string;
  kind: ExerciseKind;
  parts: BodyPart[];          // primary first
  equipment: string;
  defaultUnit: WeightUnit;
  increment: Record<WeightUnit, number>;
  perHand?: boolean;
  unilateral?: boolean;       // one side at a time: takes about twice as long
  bodyweight?: boolean;
  speedIncline?: boolean;     // cardio machines that log speed + incline
  defaultMinutes?: number;    // cardio/sports: starting duration in the builder
  custom?: boolean;
  archived?: boolean;
  library?: boolean;          // from Free Exercise DB
  level?: 'beginner' | 'intermediate' | 'expert';
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  images?: string[];
  targetSets: number;
  repRange?: [number, number];
  targetSec?: number;
  restSec: number;
  cues: string[];
  substitutes: string[];
  aliases: string[];
}

export const BODY_PARTS: { id: BodyPart; label: string }[] = [
  { id: 'chest', label: 'Chest' }, { id: 'back', label: 'Back' }, { id: 'shoulders', label: 'Shoulders' },
  { id: 'arms', label: 'Arms' }, { id: 'legs', label: 'Legs' }, { id: 'glutes', label: 'Glutes' },
  { id: 'core', label: 'Core' }, { id: 'cardio', label: 'Cardio' }, { id: 'sports', label: 'Sports' },
  { id: 'mobility', label: 'Stretch' },
];

const inc = (lb: number, kg: number, machine: number) => ({ lb, kg, machine });
const NONE = inc(0, 0, 0);
type Def = Omit<ExerciseDef, 'id'>;
const strength = (d: Partial<Def> & Pick<Def, 'name' | 'parts' | 'equipment' | 'cues' | 'aliases'>): Def => ({
  kind: 'strength', defaultUnit: 'lb', increment: inc(5, 2.5, 1), targetSets: 2, repRange: [10, 12], restSec: 90, substitutes: [], ...d,
});
const cardio = (d: Partial<Def> & Pick<Def, 'name' | 'equipment' | 'cues' | 'aliases'>): Def => ({
  kind: 'cardio', parts: ['cardio'], defaultUnit: 'lb', increment: NONE, targetSets: 1, restSec: 0, substitutes: [], ...d,
});
const sport = (name: string, aliases: string[], defaultMinutes = 60): Def => ({
  kind: 'cardio', parts: ['sports'], name, equipment: 'Activity', aliases, defaultMinutes, defaultUnit: 'lb', increment: NONE,
  targetSets: 1, restSec: 0, substitutes: [],
  cues: ['Warm up for a few minutes before going hard.', 'Hydrate, especially in long sessions.', 'Log how long you played and how hard it felt.'],
});
const timed = (d: Partial<Def> & Pick<Def, 'name' | 'parts' | 'equipment' | 'cues' | 'aliases'>): Def => ({
  kind: 'timed', defaultUnit: 'lb', increment: NONE, targetSets: 2, targetSec: 30, restSec: 45, substitutes: [], ...d,
});

const DEFS: Record<string, Def> = {
  // Cardio
  treadmill: cardio({ name: 'Treadmill', equipment: 'Treadmill', speedIncline: true, aliases: ['treadmill', 'incline walk'], substitutes: ['bike', 'elliptical'],
    cues: ['Start easy and build over the first few minutes.', 'Stay off the handrails if you can do so safely.', 'Aim for a pace where you could still talk.'] }),
  bike: cardio({ name: 'Stationary bike', equipment: 'Bike', aliases: ['stationary bike', 'bike', 'cycle'], substitutes: ['treadmill', 'elliptical'],
    cues: ['Seat height: slight knee bend at the bottom of the pedal stroke.', 'Keep resistance conversational.'] }),
  rower: cardio({ name: 'Rowing machine', equipment: 'Rower', aliases: ['rower', 'rowing machine', 'erg'], substitutes: ['bike'],
    cues: ['Legs, then body, then arms. Reverse on the way back.', 'Damper around 3–5; higher isn’t better.'] }),
  elliptical: cardio({ name: 'Elliptical', equipment: 'Elliptical', aliases: ['elliptical'], substitutes: ['treadmill', 'bike'],
    cues: ['Stand tall, light grip on the handles.', 'Low impact: good for recovery days.'] }),
  stairs: cardio({ name: 'Stair climber', equipment: 'Stair machine', aliases: ['stair climber', 'stairmaster', 'stairs'], substitutes: ['treadmill'],
    cues: ['Slow and steady; don’t lean on the rails.', 'Full foot on each step.'] }),

  // Sports and activities (logged as minutes + effort)
  basketball: sport('Basketball', ['basketball', 'hoops', 'pickup']),
  football: sport('Football', ['football', 'flag football']),
  soccer: sport('Soccer', ['soccer']),
  tennis: sport('Tennis', ['tennis']),
  pickleball: sport('Pickleball', ['pickleball']),
  golf: sport('Golf (walking)', ['golf'], 120),
  snowboarding: sport('Snowboarding / skiing', ['snowboard', 'snowboarding', 'skiing', 'ski'], 120),
  hiking: sport('Hiking', ['hike', 'hiking'], 60),
  swimming: sport('Swimming', ['swim', 'swimming'], 30),
  yoga: sport('Yoga / mobility', ['yoga', 'mobility', 'stretching'], 30),

  // Conditioning moves used in HIIT, EMOM and AMRAP programs
  'interval-block': cardio({ name: 'Interval block', equipment: 'Timer', aliases: [], cues: [], archived: true }),
  burpee: timed({ name: 'Burpee', parts: ['cardio', 'chest'], equipment: 'Bodyweight', aliases: ['burpee', 'burpees'],
    cues: ['Squat, hands down, jump or step back to a plank.', 'Chest to floor (or skip it), then jump or step your feet in.', 'Stand and jump with arms overhead. Step instead of jumping to keep it low impact.'] }),
  'jumping-jacks': timed({ name: 'Jumping jacks', parts: ['cardio'], equipment: 'Bodyweight', aliases: ['jumping jack', 'jumping jacks'],
    cues: ['Jump feet wide as arms go overhead, then back together.', 'Stay light on the balls of your feet.', 'Low impact: step one foot out at a time.'] }),
  'high-knees': timed({ name: 'High knees', parts: ['cardio', 'core'], equipment: 'Bodyweight', aliases: ['high knees'],
    cues: ['Run in place driving knees to hip height.', 'Pump your arms and stay tall.', 'March instead of running to make it easier.'] }),
  'skater-hops': timed({ name: 'Skater hops', parts: ['cardio', 'legs'], equipment: 'Bodyweight', aliases: ['skater', 'skaters', 'skater hops'],
    cues: ['Leap sideways onto one foot, other leg sweeps behind.', 'Land softly with a bent knee, then leap back.', 'Make the hop smaller to reduce impact.'] }),
  'plank-jack': timed({ name: 'Plank jacks', parts: ['core', 'cardio'], equipment: 'Bodyweight', aliases: ['plank jack', 'plank jacks'],
    cues: ['From a high plank, jump feet wide and back together.', 'Keep hips level; don’t let them bounce up.'] }),
  'v-up': timed({ name: 'V-ups', parts: ['core'], equipment: 'Bodyweight', aliases: ['v-up', 'v-ups', 'v up'],
    cues: ['Lie flat, arms overhead.', 'Lift legs and torso together, reaching for your shins.', 'Bend your knees (tuck-ups) to make it easier.'] }),
  'hollow-hold': timed({ name: 'Hollow hold', parts: ['core'], equipment: 'Bodyweight', aliases: ['hollow hold', 'hollow body'],
    cues: ['Lie on your back, press your low back into the floor.', 'Lift shoulders and legs a few inches; hold.', 'Bend knees or bring arms forward to make it easier.'] }),
  'bird-dog': timed({ name: 'Bird dog', parts: ['core', 'back'], equipment: 'Bodyweight', aliases: ['bird dog', 'bird-dog'],
    cues: ['On hands and knees, reach one arm forward and the opposite leg back.', 'Keep hips square; move slowly.', 'Alternate sides each rep.'] }),
  'bicycle-crunch': timed({ name: 'Bicycle crunch', parts: ['core'], equipment: 'Bodyweight', aliases: ['bicycle crunch', 'bicycle crunches', 'bicycles'],
    cues: ['Hands lightly behind your head.', 'Bring one elbow toward the opposite knee as the other leg extends.', 'Slow and controlled beats fast and sloppy.'] }),
  'wall-sit': timed({ name: 'Wall sit', parts: ['legs'], equipment: 'Bodyweight', aliases: ['wall sit'],
    cues: ['Back flat on the wall, thighs about parallel to the floor.', 'Knees over ankles; breathe steadily.'] }),
  'dead-hang': timed({ name: 'Dead hang', parts: ['back', 'arms'], equipment: 'Pull-up bar', targetSec: 20, aliases: ['dead hang'],
    cues: ['Hang from a bar with straight arms.', 'Shoulders slightly engaged, not shrugged into your ears.'] }),
  'thoracic-rotation': timed({ name: 'Open book rotation', parts: ['mobility', 'back'], equipment: 'Bodyweight', unilateral: true, aliases: ['open book', 'thoracic rotation'],
    cues: ['Lie on your side, knees bent, arms out in front.', 'Open the top arm across to the other side, following it with your eyes.', 'Time is per side.'] }),
  'pigeon-stretch': timed({ name: 'Pigeon stretch', parts: ['mobility', 'glutes'], equipment: 'Bodyweight', unilateral: true, aliases: ['pigeon', 'pigeon stretch'],
    cues: ['Front shin across the mat, back leg straight behind.', 'Square your hips and fold forward gently.', 'Use a cushion under your hip if needed. Time is per side.'] }),
  'bw-glute-bridge': strength({ name: 'Glute bridge', parts: ['glutes', 'legs'], equipment: 'Bodyweight', bodyweight: true, increment: NONE, repRange: [12, 15], restSec: 45, aliases: ['glute bridge', 'bridges'],
    cues: ['Lie on your back, feet flat, knees bent.', 'Drive through heels and squeeze glutes to lift hips.', 'Pause at the top; lower slowly.'] }),
  'reverse-lunge': strength({ name: 'Reverse lunge', parts: ['legs', 'glutes'], equipment: 'Bodyweight', bodyweight: true, unilateral: true, increment: NONE, repRange: [8, 12], restSec: 60, aliases: ['reverse lunge', 'reverse lunges'],
    cues: ['Step back and lower your back knee toward the floor.', 'Front knee stays over the ankle.', 'Push through the front heel to stand. Reps are per leg.'] }),
  'cossack-squat': strength({ name: 'Cossack squat', parts: ['legs', 'mobility'], equipment: 'Bodyweight', bodyweight: true, unilateral: true, increment: NONE, repRange: [6, 8], restSec: 60, aliases: ['cossack'],
    cues: ['Wide stance; shift into one hip, the other leg straight with toes up.', 'Go only as deep as you can with a flat back.'] }),
  'kb-swing': strength({ name: 'Kettlebell swing', parts: ['glutes', 'legs', 'back'], equipment: 'Kettlebell', increment: inc(5, 4, 1), repRange: [12, 20], restSec: 60, aliases: ['kettlebell swing', 'kb swing', 'swings'],
    cues: ['Hinge at the hips, hike the bell back between your legs.', 'Snap hips forward to float it to chest height. Arms just guide it.', 'Brace at the top; don’t lean back.'] }),
  'wall-ball': strength({ name: 'Wall ball', parts: ['legs', 'shoulders', 'cardio'], equipment: 'Medicine ball', increment: inc(2, 1, 1), repRange: [10, 20], restSec: 60, aliases: ['wall ball', 'wall balls'],
    cues: ['Hold a medicine ball at your chest facing a wall.', 'Squat, then drive up and throw the ball to a target above.', 'Catch it and go straight into the next squat.'] }),

  // Legs + glutes
  'leg-press': strength({ name: 'Leg press', parts: ['legs', 'glutes'], equipment: 'Machine', increment: inc(10, 5, 1), aliases: ['leg press', 'legpress'], substitutes: ['goblet-squat'],
    cues: ['Feet shoulder-width, mid-platform.', 'Lower until your hips start to tuck, then press through your whole foot.', 'Don’t lock your knees at the top.'] }),
  'goblet-squat': strength({ name: 'Goblet squat', parts: ['legs', 'glutes'], equipment: 'Dumbbell', increment: inc(5, 2, 1), aliases: ['goblet squat', 'squat'], substitutes: ['leg-press'],
    cues: ['Hold the dumbbell at your chest.', 'Sit between your heels, chest tall.', 'Drive up through mid-foot.'] }),
  'leg-extension': strength({ name: 'Leg extension', parts: ['legs'], equipment: 'Machine', restSec: 75, aliases: ['leg extension'], substitutes: ['goblet-squat'],
    cues: ['Pad just above your ankles; knee lined up with the machine pivot.', 'Pause briefly at the top; lower slowly.'] }),
  'leg-curl': strength({ name: 'Leg curl', parts: ['legs'], equipment: 'Machine', restSec: 75, aliases: ['leg curl', 'hamstring curl'], substitutes: ['rdl'],
    cues: ['Hips stay pressed into the pad.', 'Curl smoothly; control the return.'] }),
  rdl: strength({ name: 'Dumbbell Romanian deadlift', parts: ['legs', 'glutes', 'back'], equipment: 'Dumbbells', perHand: true, aliases: ['romanian deadlift', 'rdl', 'deadlift'], substitutes: ['leg-curl', 'hip-thrust'],
    cues: ['Soft knees; push your hips back.', 'Dumbbells slide down your thighs, back flat.', 'Stop when you feel a hamstring stretch.'] }),
  lunge: strength({ name: 'Walking lunge', parts: ['legs', 'glutes'], equipment: 'Dumbbells', perHand: true, unilateral: true, repRange: [8, 10], increment: inc(5, 2, 1), aliases: ['lunge', 'lunges'], substitutes: ['goblet-squat'],
    cues: ['Long step; back knee lowers toward the floor.', 'Front knee tracks over your toes.', 'Reps are per leg.'] }),
  'hip-thrust': strength({ name: 'Hip thrust', parts: ['glutes', 'legs'], equipment: 'Machine or barbell', increment: inc(10, 5, 1), aliases: ['hip thrust', 'glute bridge'], substitutes: ['rdl'],
    cues: ['Upper back on the bench, chin tucked.', 'Drive through heels; squeeze glutes at the top.'] }),
  'calf-raise': strength({ name: 'Calf raise', parts: ['legs'], equipment: 'Machine', repRange: [12, 15], restSec: 60, increment: inc(10, 5, 1), aliases: ['calf raise', 'calves'],
    cues: ['Full stretch at the bottom, pause at the top.', 'Slow on the way down.'] }),

  // Chest
  'chest-press': strength({ name: 'Chest press', parts: ['chest'], equipment: 'Machine', aliases: ['chest press', 'chest', 'bench'], substitutes: ['db-bench', 'pushup'],
    cues: ['Handles at mid-chest height.', 'Shoulder blades back and down against the pad.', 'Press smoothly; control the return for two counts.'] }),
  'db-bench': strength({ name: 'Dumbbell bench press', parts: ['chest'], equipment: 'Dumbbells', perHand: true, increment: inc(5, 2, 1), aliases: ['dumbbell bench', 'db bench'], substitutes: ['chest-press', 'pushup'],
    cues: ['Feet planted, slight arch.', 'Lower to chest level with elbows about 45°.'] }),
  'incline-db-press': strength({ name: 'Incline dumbbell press', parts: ['chest', 'shoulders'], equipment: 'Dumbbells', perHand: true, increment: inc(5, 2, 1), aliases: ['incline press', 'incline dumbbell'], substitutes: ['db-bench'],
    cues: ['Bench at about 30°.', 'Press up and slightly back over your upper chest.'] }),
  'pec-deck': strength({ name: 'Pec deck fly', parts: ['chest'], equipment: 'Machine', restSec: 75, aliases: ['pec deck', 'chest fly', 'fly'], substitutes: ['chest-press'],
    cues: ['Slight bend in the elbows throughout.', 'Squeeze in front of your chest; open slowly.'] }),
  pushup: strength({ name: 'Push-up', parts: ['chest', 'core'], equipment: 'Bodyweight', increment: NONE, bodyweight: true, repRange: [8, 15], restSec: 60, aliases: ['push up', 'pushup', 'push-up'], substitutes: ['chest-press'],
    cues: ['Body in one straight line.', 'Hands on a bench makes it easier.'] }),

  // Back
  'lat-pulldown': strength({ name: 'Lat pulldown', parts: ['back'], equipment: 'Cable machine', aliases: ['lat pulldown', 'pulldown', 'lat pull', 'lats'], substitutes: ['db-row'],
    cues: ['Grip slightly wider than shoulders.', 'Pull the bar to your upper chest, elbows down and back.', 'Avoid leaning way back or yanking.'] }),
  'seated-row': strength({ name: 'Seated cable row', parts: ['back'], equipment: 'Cable machine', defaultUnit: 'machine', increment: inc(5, 2.5, 2.5), aliases: ['seated row', 'cable row', 'seated cable row', 'row'], substitutes: ['db-row'],
    cues: ['Sit tall, slight knee bend.', 'Pull to your lower ribs and squeeze your shoulder blades together.', 'Let the weight return slowly without rounding forward.'] }),
  'db-row': strength({ name: 'One-arm dumbbell row', parts: ['back'], equipment: 'Dumbbell', perHand: true, unilateral: true, increment: inc(5, 2, 1), restSec: 75, aliases: ['dumbbell row', 'db row'], substitutes: ['seated-row'],
    cues: ['Hand and knee on a bench, back flat.', 'Pull the dumbbell toward your hip.', 'Reps are per side.'] }),
  'back-extension': strength({ name: 'Back extension', parts: ['back', 'glutes'], equipment: 'Roman chair', bodyweight: true, increment: NONE, repRange: [10, 15], restSec: 60, aliases: ['back extension', 'hyperextension'], substitutes: ['rdl'],
    cues: ['Hinge at the hips, not the low back.', 'Rise until your body is in a straight line; no over-arching.'] }),

  // Shoulders
  'db-shoulder-press': strength({ name: 'Dumbbell shoulder press', parts: ['shoulders'], equipment: 'Dumbbells', perHand: true, increment: inc(2.5, 1, 1), repRange: [8, 10], aliases: ['dumbbell shoulder press', 'shoulder press', 'overhead press', 'ohp', 'shoulders'], substitutes: ['machine-shoulder-press'],
    cues: ['Seated with back support.', 'Start at ear height; press overhead without flaring your ribs.', 'Lower under control.'] }),
  'machine-shoulder-press': strength({ name: 'Machine shoulder press', parts: ['shoulders'], equipment: 'Machine', repRange: [8, 10], aliases: ['machine shoulder press'], substitutes: ['db-shoulder-press'],
    cues: ['Handles at shoulder height.', 'Press up without shrugging.'] }),
  'lateral-raise': strength({ name: 'Lateral raise', parts: ['shoulders'], equipment: 'Dumbbells', perHand: true, increment: inc(2.5, 1, 1), repRange: [12, 15], restSec: 60, aliases: ['lateral raise', 'side raise'], substitutes: ['face-pull'],
    cues: ['Light weight; lead with your elbows.', 'Raise to shoulder height, no swinging.'] }),
  'face-pull': strength({ name: 'Face pull', parts: ['shoulders', 'back'], equipment: 'Cable machine', repRange: [12, 15], restSec: 60, aliases: ['face pull'], substitutes: ['rear-delt-fly'],
    cues: ['Rope at face height.', 'Pull toward your eyes, elbows high, rotate hands back.'] }),
  'rear-delt-fly': strength({ name: 'Rear delt fly', parts: ['shoulders', 'back'], equipment: 'Machine', repRange: [12, 15], restSec: 60, aliases: ['rear delt', 'reverse fly'], substitutes: ['face-pull'],
    cues: ['Arms nearly straight.', 'Open wide and squeeze between your shoulder blades.'] }),

  // Arms
  'db-curl': strength({ name: 'Dumbbell curl', parts: ['arms'], equipment: 'Dumbbells', perHand: true, increment: inc(2.5, 1, 1), restSec: 60, aliases: ['bicep curl', 'dumbbell curl', 'curl', 'biceps'], substitutes: ['hammer-curl'],
    cues: ['Elbows pinned at your sides.', 'No swinging; lower slowly.'] }),
  'hammer-curl': strength({ name: 'Hammer curl', parts: ['arms'], equipment: 'Dumbbells', perHand: true, increment: inc(2.5, 1, 1), restSec: 60, aliases: ['hammer curl'], substitutes: ['db-curl'],
    cues: ['Palms face each other.', 'Curl to shoulder height, control down.'] }),
  'triceps-pushdown': strength({ name: 'Triceps pushdown', parts: ['arms'], equipment: 'Cable machine', restSec: 60, aliases: ['triceps pushdown', 'tricep pushdown', 'pushdown', 'triceps'], substitutes: ['overhead-triceps'],
    cues: ['Elbows stay tucked at your sides.', 'Lock out fully, then return slowly.'] }),
  'overhead-triceps': strength({ name: 'Overhead triceps extension', parts: ['arms'], equipment: 'Dumbbell', increment: inc(5, 2, 1), restSec: 60, aliases: ['overhead triceps', 'overhead extension'], substitutes: ['triceps-pushdown'],
    cues: ['Hold one dumbbell with both hands overhead.', 'Lower behind your head, elbows pointing up.'] }),

  // Core
  plank: timed({ name: 'Plank', parts: ['core'], equipment: 'Bodyweight', aliases: ['plank', 'planks', 'core'], substitutes: ['dead-bug'],
    cues: ['Elbows under shoulders.', 'Squeeze your glutes and keep hips level.', 'Stop when your form slips, not when it hurts.'] }),
  'side-plank': timed({ name: 'Side plank', parts: ['core'], equipment: 'Bodyweight', unilateral: true, targetSec: 20, aliases: ['side plank'], substitutes: ['plank'],
    cues: ['Elbow under shoulder, hips stacked and lifted.', 'Time is per side.'] }),
  'dead-bug': timed({ name: 'Dead bug', parts: ['core'], equipment: 'Bodyweight', aliases: ['dead bug'], substitutes: ['plank'],
    cues: ['Low back pressed to the floor.', 'Move slowly, opposite arm and leg.'] }),
  'cable-crunch': strength({ name: 'Cable crunch', parts: ['core'], equipment: 'Cable machine', repRange: [12, 15], restSec: 60, aliases: ['cable crunch', 'crunch'], substitutes: ['dead-bug'],
    cues: ['Kneel facing the stack, rope by your head.', 'Curl your ribs toward your hips; don’t pull with your arms.'] }),
};

export const EXERCISES: Record<string, ExerciseDef> = Object.fromEntries(Object.entries(DEFS).map(([id, d]) => [id, { id, ...d }]));
/** Make the person's own exercises resolvable everywhere (sessions, history, coach, charts). */
export function registerCustomExercises(list: CustomExercise[]) {
  for (const id of Object.keys(EXERCISES)) if (id.startsWith('custom-') && !list.some((c) => c.id === id)) delete EXERCISES[id];
  for (const c of list) {
    const step = c.kind === 'strength' && !c.bodyweight ? (c.perHand ? inc(2.5, 1, 1) : inc(5, 2.5, 1)) : NONE;
    EXERCISES[c.id] = {
      id: c.id, name: c.name, kind: c.kind, parts: c.parts.length ? c.parts : ['cardio'], equipment: c.equipment,
      defaultUnit: c.defaultUnit, increment: step, perHand: c.perHand, unilateral: c.unilateral, bodyweight: c.bodyweight,
      targetSets: c.kind === 'cardio' ? 1 : 2, repRange: c.kind === 'strength' ? c.repRange ?? [10, 12] : undefined,
      targetSec: c.kind === 'timed' ? c.targetSec ?? 30 : undefined, defaultMinutes: c.defaultMinutes,
      restSec: c.restSec, cues: ['Your own exercise. Keep the movement controlled and log how it felt.'],
      substitutes: [], aliases: [c.name.toLowerCase()], custom: true, archived: c.archived,
    };
  }
}

export interface TemplateItem { exerciseId: string; role: Role; sets?: number; minutes?: number; interval?: import('../types').IntervalSpec; hint?: string }
export interface Template { id: TemplateId; title: string; items: TemplateItem[]; cooldown: boolean }

export const TEMPLATES: Record<TemplateId, Template> = {
  full: {
    id: 'full', title: 'Full-body strength', cooldown: true,
    items: [
      { exerciseId: 'treadmill', role: 'warmup', minutes: 5 },
      { exerciseId: 'leg-press', role: 'main' },
      { exerciseId: 'chest-press', role: 'main' },
      { exerciseId: 'lat-pulldown', role: 'main' },
      { exerciseId: 'seated-row', role: 'main' },
      { exerciseId: 'db-shoulder-press', role: 'main' },
      { exerciseId: 'plank', role: 'main' },
      { exerciseId: 'treadmill', role: 'finisher', minutes: 8 },
    ],
  },
  quick: {
    id: 'quick', title: '15-minute reset', cooldown: false,
    items: [
      { exerciseId: 'leg-press', role: 'main', sets: 2 },
      { exerciseId: 'chest-press', role: 'main', sets: 2 },
      { exerciseId: 'seated-row', role: 'main', sets: 2 },
      { exerciseId: 'plank', role: 'main', sets: 1 },
    ],
  },
};

export const unitLabel = (u: WeightUnit) => (u === 'machine' ? 'units' : u);

export function findExerciseInText(text: string): string | null {
  const t = text.toLowerCase();
  let best: { id: string; len: number } | null = null;
  for (const def of Object.values(EXERCISES)) {
    for (const a of def.aliases) {
      if (t.includes(a) && (!best || a.length > best.len)) best = { id: def.id, len: a.length };
    }
  }
  return best?.id ?? null;
}

// ── Exercise library (Free Exercise DB, public domain) ────────────────────
interface LibraryFile {
  builtInMedia: Record<string, Pick<ExerciseDef, 'images' | 'instructions' | 'level' | 'primaryMuscles' | 'secondaryMuscles'>>;
  exercises: (Omit<ExerciseDef, 'increment' | 'targetSets' | 'cues' | 'substitutes' | 'aliases' | 'defaultUnit'> & { increment: [number, number, number] })[];
}

let libraryLoaded = false;
export function registerLibrary(lib: LibraryFile) {
  if (libraryLoaded) return;
  libraryLoaded = true;
  for (const [id, media] of Object.entries(lib.builtInMedia)) if (EXERCISES[id]) Object.assign(EXERCISES[id], media);
  for (const x of lib.exercises) {
    if (EXERCISES[x.id]) continue;
    EXERCISES[x.id] = {
      ...x,
      increment: inc(...x.increment),
      defaultUnit: 'lb',
      targetSets: x.kind === 'cardio' ? 1 : 2,
      cues: [],
      substitutes: [],
      aliases: [x.name.toLowerCase()],
      library: true,
    };
  }
}

/** Loads the library as a separate chunk so the app shell stays small. */
export async function loadLibrary() {
  try {
    const mod = await import('./library.json');
    registerLibrary((mod.default ?? mod) as unknown as LibraryFile);
  } catch { /* offline on first load: built-ins still work */ }
}

/** Never let an unknown id crash a screen (e.g. library not loaded yet): register a readable placeholder. */
export function ensureKnown(ids: Iterable<string>) {
  for (const id of ids) {
    if (EXERCISES[id]) continue;
    const name = id.replace(/^(fx|custom)-/, '').replace(/_/g, ' ');
    EXERCISES[id] = { id, name, kind: 'strength', parts: ['core'], equipment: 'Other', defaultUnit: 'lb', increment: inc(5, 2.5, 1),
      targetSets: 2, repRange: [8, 12], restSec: 90, cues: [], substitutes: [], aliases: [], archived: true };
  }
}
