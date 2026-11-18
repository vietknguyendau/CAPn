// Ready-made workouts. Moves are written by name (or Momentum id) and resolved to
// exercise ids when a workout starts, so library exercises can be used directly.
import type { IntervalSpec } from '../types';
import { EXERCISES } from './exercises';

export type ProgramCategory = 'HIIT' | 'EMOM & AMRAP' | 'Strength' | 'Dumbbell' | 'Bodyweight' | 'Kettlebell' | 'Cardio' | 'Core & balance' | 'Mobility' | 'Quick' | 'Sport prep';
export const PROGRAM_CATEGORIES: ProgramCategory[] = ['HIIT', 'EMOM & AMRAP', 'Strength', 'Dumbbell', 'Bodyweight', 'Kettlebell', 'Cardio', 'Core & balance', 'Mobility', 'Quick', 'Sport prep'];

export type Equipment = 'none' | 'dumbbells' | 'kettlebell' | 'gym' | 'cardio machine';
export const EQUIPMENT_LABEL: Record<Equipment, string> = { none: 'No equipment', dumbbells: 'Dumbbells', kettlebell: 'Kettlebell', gym: 'Full gym', 'cardio machine': 'Cardio machine' };

export type Block = { ex: string; sets?: number; minutes?: number; hint?: string } | { interval: IntervalSpec };
export interface Program {
  id: string; name: string; category: ProgramCategory; level: 'beginner' | 'intermediate' | 'advanced';
  equipment: Equipment; blurb: string; warmup: boolean; cooldown: boolean; blocks: Block[]; popular?: boolean;
}

// ── helpers ──
const S = (ex: string, sets = 3): Block => ({ ex, sets });
const M = (ex: string, minutes: number, hint?: string): Block => ({ ex, minutes, hint });
const tabata = (moves: string[], name = 'Tabata', rounds = 8): Block =>
  ({ interval: { format: 'tabata', name, workSec: 20, restSec: 10, rounds, moves } });
const hiit = (workSec: number, restSec: number, rounds: number, moves: string[], name = 'Circuit', roundRestSec = 60): Block =>
  ({ interval: { format: 'hiit', name, workSec, restSec, rounds, moves, roundRestSec } });
const intervals = (machine: string, workSec: number, restSec: number, rounds: number, name: string): Block =>
  ({ interval: { format: 'hiit', name, workSec, restSec, rounds, moves: [machine], roundRestSec: restSec } });
const emom = (minutes: number, moves: string[], reps: string[], name = `EMOM ${minutes}`): Block =>
  ({ interval: { format: 'emom', name, workSec: 60, restSec: 0, rounds: minutes, moves, reps } });
const amrap = (minutes: number, moves: string[], reps: string[], name = `AMRAP ${minutes}`): Block =>
  ({ interval: { format: 'amrap', name, workSec: minutes * 60, restSec: 0, rounds: 1, moves, reps } });

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
type P = Omit<Program, 'id' | 'warmup' | 'cooldown'> & { warmup?: boolean; cooldown?: boolean };
const P = (p: P): Program => ({ warmup: true, cooldown: true, ...p, id: slug(p.name) });

export const PROGRAMS: Program[] = [
  // ── HIIT ─────────────────────────────────────────────
  P({ name: 'Classic Tabata', category: 'HIIT', level: 'intermediate', equipment: 'none', popular: true,
    blurb: 'Three 4-minute Tabatas: 20 seconds all-out, 10 seconds rest.',
    blocks: [tabata(['burpee', 'Freehand Jump Squat'], 'Tabata 1'), tabata(['Mountain Climbers', 'high-knees'], 'Tabata 2'), tabata(['pushup', 'plank-jack'], 'Tabata 3')] }),
  P({ name: 'Tabata Legs', category: 'HIIT', level: 'intermediate', equipment: 'none',
    blurb: 'Leg-focused Tabatas that build power and burn.',
    blocks: [tabata(['Freehand Jump Squat', 'reverse-lunge'], 'Squat & lunge'), tabata(['skater-hops', 'wall-sit'], 'Skaters & wall sit'), tabata(['Split Jump', 'bw-glute-bridge'], 'Jumps & bridges')] }),
  P({ name: '20-Minute Bodyweight HIIT', category: 'HIIT', level: 'intermediate', equipment: 'none', popular: true,
    blurb: '40 seconds on, 20 off. Five moves, four rounds.',
    blocks: [hiit(40, 20, 4, ['burpee', 'Mountain Climbers', 'Freehand Jump Squat', 'pushup', 'high-knees'], '40/20 circuit')] }),
  P({ name: 'Low-Impact HIIT', category: 'HIIT', level: 'beginner', equipment: 'none', popular: true,
    blurb: 'Heart rate up, no jumping. Good for apartments and sore joints.',
    blocks: [hiit(30, 30, 3, ['Bodyweight Squat', 'Incline Push-Up', 'reverse-lunge', 'bw-glute-bridge', 'bird-dog'], '30/30 low impact')] }),
  P({ name: 'Full-Body HIIT 30/30', category: 'HIIT', level: 'intermediate', equipment: 'kettlebell',
    blurb: 'Swings, push-ups, lunges and climbers in a steady 30/30 rhythm.',
    blocks: [hiit(30, 30, 4, ['kb-swing', 'pushup', 'reverse-lunge', 'Mountain Climbers', 'plank-jack'], '30/30 circuit')] }),
  P({ name: 'Treadmill Sprint Intervals', category: 'HIIT', level: 'intermediate', equipment: 'cardio machine', popular: true,
    blurb: '30-second hard runs with 90-second walks. Classic fat-burning intervals.',
    blocks: [M('treadmill', 5), intervals('treadmill', 30, 90, 8, 'Sprint 30s / walk 90s')] }),
  P({ name: 'Bike Sprint Intervals', category: 'HIIT', level: 'beginner', equipment: 'cardio machine',
    blurb: '20-second pushes, 40 seconds easy. Joint-friendly and simple.',
    blocks: [M('bike', 5), intervals('bike', 20, 40, 10, 'Bike 20s hard / 40s easy')] }),
  P({ name: 'Rower Power Intervals', category: 'HIIT', level: 'intermediate', equipment: 'cardio machine',
    blurb: 'Two minutes hard, one minute easy, five times.',
    blocks: [M('rower', 5), intervals('rower', 120, 60, 5, 'Row 2 min hard / 1 min easy')] }),
  P({ name: 'Air Bike Tabata', category: 'HIIT', level: 'advanced', equipment: 'cardio machine',
    blurb: 'Two Tabatas on the air bike. Short and brutal.',
    blocks: [M('bike', 5), tabata(['Air Bike'], 'Air bike Tabata 1'), tabata(['Air Bike'], 'Air bike Tabata 2')] }),
  P({ name: 'Jump Rope HIIT', category: 'HIIT', level: 'intermediate', equipment: 'none',
    blurb: 'Rope, climbers and skaters. Needs a jump rope.',
    blocks: [hiit(45, 15, 5, ['Rope Jumping', 'Mountain Climbers', 'skater-hops'], '45/15 rope circuit')] }),
  P({ name: 'Battle Rope Finisher', category: 'HIIT', level: 'intermediate', equipment: 'gym',
    blurb: 'Quick upper-body strength, then ropes to finish.',
    blocks: [S('chest-press', 3), S('lat-pulldown', 3), intervals('Battling Ropes', 20, 40, 6, 'Ropes 20s / rest 40s')] }),
  P({ name: 'Gym Metcon Circuit', category: 'HIIT', level: 'advanced', equipment: 'gym', popular: true,
    blurb: 'Swings, box jumps, ropes, wall balls, climbers: three rounds.',
    blocks: [hiit(40, 20, 3, ['kb-swing', 'Front Box Jump', 'Battling Ropes', 'wall-ball', 'Mountain Climbers'], 'Metcon', 90)] }),
  P({ name: 'Dumbbell HIIT', category: 'HIIT', level: 'intermediate', equipment: 'dumbbells',
    blurb: 'Five dumbbell moves, 40 on / 20 off.',
    blocks: [hiit(40, 20, 4, ['Dumbbell Squat', 'Alternating Renegade Row', 'Dumbbell Lunges', 'db-shoulder-press', 'Mountain Climbers'], 'Dumbbell circuit')] }),
  P({ name: 'Upper-Body HIIT', category: 'HIIT', level: 'intermediate', equipment: 'none',
    blurb: 'Push-ups, plank jacks, dips and climbers.',
    blocks: [hiit(30, 15, 4, ['pushup', 'plank-jack', 'Bench Dips', 'Mountain Climbers', 'Push Up to Side Plank'], 'Upper circuit')] }),
  P({ name: 'Cardio Blast 25', category: 'HIIT', level: 'beginner', equipment: 'none',
    blurb: 'Jacks, high knees, skaters and squats. Pure cardio, no gear.',
    blocks: [hiit(40, 20, 5, ['jumping-jacks', 'high-knees', 'skater-hops', 'Bodyweight Squat'], 'Cardio circuit')] }),

  // ── EMOM & AMRAP ─────────────────────────────────────
  P({ name: 'EMOM 20: Full Body', category: 'EMOM & AMRAP', level: 'intermediate', equipment: 'kettlebell', popular: true,
    blurb: 'Every minute, one move. Rest whatever is left of the minute.',
    blocks: [emom(20, ['kb-swing', 'pushup', 'Bodyweight Squat', 'burpee'], ['15 swings', '10 push-ups', '15 squats', '8 burpees'])] }),
  P({ name: 'EMOM 12: Burpees & Squats', category: 'EMOM & AMRAP', level: 'beginner', equipment: 'none',
    blurb: 'Alternate burpees and squats every minute.',
    blocks: [emom(12, ['burpee', 'Bodyweight Squat'], ['6 burpees', '15 squats'])] }),
  P({ name: 'EMOM 16: Kettlebell', category: 'EMOM & AMRAP', level: 'intermediate', equipment: 'kettlebell',
    blurb: 'Swings, goblet squats, presses and a rest minute.',
    blocks: [emom(16, ['kb-swing', 'goblet-squat', 'Two-Arm Kettlebell Military Press', 'plank'], ['15 swings', '10 squats', '8 presses', '40s plank'])] }),
  P({ name: 'EMOM 10: Push-Up Builder', category: 'EMOM & AMRAP', level: 'beginner', equipment: 'none',
    blurb: 'A few clean push-ups every minute adds up fast.',
    blocks: [emom(10, ['pushup'], ['5–10 push-ups'])] }),
  P({ name: 'EMOM 14: Cardio & Core', category: 'EMOM & AMRAP', level: 'intermediate', equipment: 'none',
    blurb: 'Alternate a cardio minute with a core minute.',
    blocks: [emom(14, ['high-knees', 'v-up'], ['40s high knees', '12 V-ups'])] }),
  P({ name: 'AMRAP 15: Bodyweight Chipper', category: 'EMOM & AMRAP', level: 'intermediate', equipment: 'none', popular: true,
    blurb: 'As many rounds as possible in 15 minutes.',
    blocks: [amrap(15, ['pushup', 'Bodyweight Squat', 'Mountain Climbers', 'v-up'], ['10 push-ups', '15 squats', '20 climbers', '10 V-ups'])] }),
  P({ name: 'AMRAP 20: 5-10-15', category: 'EMOM & AMRAP', level: 'advanced', equipment: 'gym', popular: true,
    blurb: 'The classic: 5 pull-ups, 10 push-ups, 15 squats for 20 minutes.',
    blocks: [amrap(20, ['Pullups', 'pushup', 'Bodyweight Squat'], ['5 pull-ups', '10 push-ups', '15 squats'])] }),
  P({ name: 'AMRAP 12: Dumbbell', category: 'EMOM & AMRAP', level: 'intermediate', equipment: 'dumbbells',
    blurb: 'Squat, row, press, lunge. Keep moving for 12 minutes.',
    blocks: [amrap(12, ['Dumbbell Squat', 'Bent Over Two-Dumbbell Row', 'db-shoulder-press', 'Dumbbell Lunges'], ['12 squats', '10 rows', '8 presses', '10 lunges'])] }),
  P({ name: 'AMRAP 10: Core Burner', category: 'EMOM & AMRAP', level: 'beginner', equipment: 'none',
    blurb: 'Ten minutes of nonstop core work.',
    blocks: [amrap(10, ['bicycle-crunch', 'Flutter Kicks', 'plank-jack', 'Superman'], ['20 bicycles', '20 flutters', '15 plank jacks', '10 supermans'])] }),
  P({ name: 'Strength + AMRAP Finisher', category: 'EMOM & AMRAP', level: 'intermediate', equipment: 'gym',
    blurb: 'Heavy squats first, then a short conditioning AMRAP.',
    blocks: [S('Barbell Squat', 5), S('Bent Over Barbell Row', 4), amrap(8, ['kb-swing', 'burpee'], ['15 swings', '8 burpees'], 'Finisher AMRAP 8')] }),
  P({ name: 'Hybrid Race Prep EMOM', category: 'EMOM & AMRAP', level: 'advanced', equipment: 'gym', popular: true,
    blurb: 'Fitness-race style: row, wall balls, sled, carries and lunges.',
    blocks: [emom(30, ['rower', 'wall-ball', 'Sled Push', "Farmer's Walk", 'Bodyweight Walking Lunge'], ['250 m row', '15 wall balls', '1 lap sled', '40 m carry', '20 lunges'], 'EMOM 30')] }),
  P({ name: 'AMRAP 8 × 2: Sprint Couplets', category: 'EMOM & AMRAP', level: 'intermediate', equipment: 'kettlebell',
    blurb: 'Two short AMRAPs with a rest between.',
    blocks: [amrap(8, ['kb-swing', 'pushup'], ['12 swings', '10 push-ups'], 'AMRAP 8 (A)'), amrap(8, ['Freehand Jump Squat', 'Mountain Climbers'], ['10 jump squats', '20 climbers'], 'AMRAP 8 (B)')] }),

  // ── Strength ─────────────────────────────────────────
  P({ name: 'Push Day', category: 'Strength', level: 'intermediate', equipment: 'gym', popular: true,
    blurb: 'Chest, shoulders and triceps.',
    blocks: [S('Barbell Bench Press - Medium Grip', 4), S('incline-db-press'), S('db-shoulder-press'), S('lateral-raise'), S('triceps-pushdown'), S('overhead-triceps', 2)] }),
  P({ name: 'Pull Day', category: 'Strength', level: 'intermediate', equipment: 'gym', popular: true,
    blurb: 'Back, rear delts and biceps.',
    blocks: [S('lat-pulldown', 4), S('Bent Over Barbell Row'), S('seated-row'), S('face-pull'), S('db-curl'), S('hammer-curl', 2)] }),
  P({ name: 'Leg Day', category: 'Strength', level: 'intermediate', equipment: 'gym', popular: true,
    blurb: 'Squat, hinge, press and curl.',
    blocks: [S('Barbell Squat', 4), S('Romanian Deadlift'), S('leg-press'), S('leg-curl'), S('calf-raise'), S('plank', 2)] }),
  P({ name: 'Upper Body A', category: 'Strength', level: 'intermediate', equipment: 'gym',
    blurb: 'Balanced push and pull, heavier focus.',
    blocks: [S('Barbell Bench Press - Medium Grip', 4), S('Bent Over Barbell Row', 4), S('Standing Military Press'), S('lat-pulldown'), S('db-curl', 2), S('triceps-pushdown', 2)] }),
  P({ name: 'Upper Body B', category: 'Strength', level: 'intermediate', equipment: 'gym',
    blurb: 'Dumbbells and cables, higher reps.',
    blocks: [S('incline-db-press'), S('seated-row'), S('Arnold Dumbbell Press'), S('db-row'), S('lateral-raise'), S('hammer-curl', 2)] }),
  P({ name: 'Lower Body A', category: 'Strength', level: 'intermediate', equipment: 'gym',
    blurb: 'Squat-focused lower day.',
    blocks: [S('Barbell Squat', 4), S('leg-press'), S('Dumbbell Lunges'), S('leg-extension'), S('calf-raise'), S('cable-crunch', 2)] }),
  P({ name: 'Lower Body B', category: 'Strength', level: 'intermediate', equipment: 'gym',
    blurb: 'Hinge-focused lower day.',
    blocks: [S('Barbell Deadlift', 4), S('hip-thrust'), S('Split Squat with Dumbbells'), S('leg-curl'), S('back-extension', 2), S('calf-raise', 2)] }),
  P({ name: 'Full Body A', category: 'Strength', level: 'beginner', equipment: 'gym', popular: true,
    blurb: 'Squat, bench, row. Do A/B/C across the week.',
    blocks: [S('Barbell Squat'), S('Barbell Bench Press - Medium Grip'), S('Bent Over Barbell Row'), S('lateral-raise', 2), S('plank', 2)] }),
  P({ name: 'Full Body B', category: 'Strength', level: 'beginner', equipment: 'gym',
    blurb: 'Deadlift, overhead press, pulldown.',
    blocks: [S('Barbell Deadlift'), S('Standing Military Press'), S('lat-pulldown'), S('Dumbbell Lunges', 2), S('dead-bug', 2)] }),
  P({ name: 'Full Body C', category: 'Strength', level: 'beginner', equipment: 'gym',
    blurb: 'Machine-friendly day to round out the week.',
    blocks: [S('leg-press'), S('incline-db-press'), S('seated-row'), S('leg-curl', 2), S('face-pull', 2), S('cable-crunch', 2)] }),
  P({ name: '5×5 Strength', category: 'Strength', level: 'intermediate', equipment: 'gym', popular: true,
    blurb: 'Five sets of five on the big lifts. Simple, proven strength.',
    blocks: [S('Barbell Squat', 5), S('Barbell Bench Press - Medium Grip', 5), S('Bent Over Barbell Row', 5)] }),
  P({ name: 'The Big Three', category: 'Strength', level: 'advanced', equipment: 'gym',
    blurb: 'Squat, bench, deadlift. Long rests, heavy sets.',
    blocks: [S('Barbell Squat', 4), S('Barbell Bench Press - Medium Grip', 4), S('Barbell Deadlift', 3)] }),
  P({ name: 'Machine-Only Full Body', category: 'Strength', level: 'beginner', equipment: 'gym', popular: true,
    blurb: 'Every move on a machine. The easiest way back into the gym.',
    blocks: [S('leg-press', 2), S('chest-press', 2), S('lat-pulldown', 2), S('seated-row', 2), S('machine-shoulder-press', 2), S('leg-curl', 2)] }),
  P({ name: 'Glute Focus', category: 'Strength', level: 'intermediate', equipment: 'gym', popular: true,
    blurb: 'Hip thrusts, RDLs, step-ups and kickbacks.',
    blocks: [S('hip-thrust', 4), S('rdl'), S('Dumbbell Step Ups'), S('Glute Kickback'), S('bw-glute-bridge', 2)] }),
  P({ name: 'Arms & Shoulders', category: 'Strength', level: 'beginner', equipment: 'gym',
    blurb: 'A pump day for shoulders, biceps and triceps.',
    blocks: [S('db-shoulder-press'), S('lateral-raise'), S('rear-delt-fly'), S('db-curl'), S('triceps-pushdown'), S('hammer-curl', 2), S('overhead-triceps', 2)] }),
  P({ name: 'Chest & Back Supersets', category: 'Strength', level: 'intermediate', equipment: 'gym',
    blurb: 'Pair a push with a pull to save time.',
    blocks: [S('Barbell Bench Press - Medium Grip'), S('Bent Over Barbell Row'), S('incline-db-press'), S('lat-pulldown'), S('pec-deck'), S('seated-row')] }),
  P({ name: 'Posterior Chain', category: 'Strength', level: 'intermediate', equipment: 'gym',
    blurb: 'Hamstrings, glutes and back. Great for posture.',
    blocks: [S('Barbell Deadlift'), S('Romanian Deadlift'), S('back-extension'), S('leg-curl'), S('face-pull'), S('Band Pull Apart', 2)] }),
  P({ name: 'Momentum Full Body', category: 'Strength', level: 'beginner', equipment: 'gym',
    blurb: 'Your default plan: leg press, chest press, pulldown, row, press, plank.',
    blocks: [S('leg-press', 2), S('chest-press', 2), S('lat-pulldown', 2), S('seated-row', 2), S('db-shoulder-press', 2), S('plank', 2)] }),
  P({ name: 'Strength + Zone 2', category: 'Strength', level: 'beginner', equipment: 'gym',
    blurb: 'Four lifts, then 20 easy minutes on the bike.',
    blocks: [S('leg-press', 2), S('chest-press', 2), S('seated-row', 2), S('goblet-squat', 2), M('bike', 20)] }),
  P({ name: 'Athletic Power', category: 'Strength', level: 'advanced', equipment: 'gym',
    blurb: 'Jumps, cleans, swings and sled pushes for explosiveness.',
    blocks: [S('Front Box Jump', 4), S('Power Clean', 4), S('kb-swing'), S('Split Jump'), S('Sled Push')] }),

  // ── Dumbbell ─────────────────────────────────────────
  P({ name: 'Dumbbell Full Body A', category: 'Dumbbell', level: 'beginner', equipment: 'dumbbells', popular: true,
    blurb: 'Everything you need with one pair of dumbbells.',
    blocks: [S('goblet-squat'), S('db-bench'), S('db-row'), S('db-shoulder-press'), S('rdl'), S('plank', 2)] }),
  P({ name: 'Dumbbell Full Body B', category: 'Dumbbell', level: 'beginner', equipment: 'dumbbells',
    blurb: 'Lunges, floor press, rows and curls.',
    blocks: [S('Dumbbell Lunges'), S('Dumbbell Floor Press'), S('Bent Over Two-Dumbbell Row'), S('Arnold Dumbbell Press'), S('Stiff-Legged Dumbbell Deadlift'), S('db-curl', 2)] }),
  P({ name: 'Dumbbell Upper Body', category: 'Dumbbell', level: 'intermediate', equipment: 'dumbbells',
    blurb: 'Press, row, raise, curl and extend.',
    blocks: [S('db-bench'), S('db-row'), S('incline-db-press'), S('lateral-raise'), S('db-curl'), S('Tricep Dumbbell Kickback')] }),
  P({ name: 'Dumbbell Lower Body', category: 'Dumbbell', level: 'intermediate', equipment: 'dumbbells',
    blurb: 'Squats, split squats, RDLs and calves.',
    blocks: [S('goblet-squat', 4), S('Split Squat with Dumbbells'), S('rdl'), S('Dumbbell Step Ups'), S('Calf Raise On A Dumbbell', 2)] }),
  P({ name: 'Dumbbell Push', category: 'Dumbbell', level: 'intermediate', equipment: 'dumbbells',
    blurb: 'Chest, shoulders, triceps with dumbbells only.',
    blocks: [S('db-bench', 4), S('incline-db-press'), S('db-shoulder-press'), S('lateral-raise'), S('overhead-triceps')] }),
  P({ name: 'Dumbbell Pull', category: 'Dumbbell', level: 'intermediate', equipment: 'dumbbells',
    blurb: 'Back and biceps with dumbbells only.',
    blocks: [S('db-row', 4), S('Bent Over Two-Dumbbell Row'), S('Alternating Renegade Row'), S('Dumbbell Shrug'), S('hammer-curl'), S('db-curl')] }),
  P({ name: 'Dumbbell Arm Day', category: 'Dumbbell', level: 'beginner', equipment: 'dumbbells',
    blurb: 'Curls and extensions, supersetted.',
    blocks: [S('db-curl'), S('overhead-triceps'), S('hammer-curl'), S('Tricep Dumbbell Kickback'), S('One Arm Dumbbell Preacher Curl', 2)] }),
  P({ name: 'Dumbbell 30-Minute Circuit', category: 'Dumbbell', level: 'intermediate', equipment: 'dumbbells',
    blurb: 'Strength circuit: 45 seconds per move, four rounds.',
    blocks: [hiit(45, 15, 4, ['goblet-squat', 'db-bench', 'db-row', 'Dumbbell Lunges', 'db-shoulder-press'], 'Dumbbell circuit', 75)] }),

  // ── Bodyweight ───────────────────────────────────────
  P({ name: 'No-Equipment Full Body', category: 'Bodyweight', level: 'beginner', equipment: 'none', popular: true,
    blurb: 'Squats, push-ups, lunges, bridges and planks.',
    blocks: [S('Bodyweight Squat'), S('pushup'), S('reverse-lunge'), S('bw-glute-bridge'), S('plank'), S('Superman', 2)] }),
  P({ name: 'Hotel Room Workout', category: 'Bodyweight', level: 'beginner', equipment: 'none',
    blurb: 'Quiet, small-space circuit for travel days.',
    blocks: [hiit(40, 20, 3, ['Bodyweight Squat', 'pushup', 'reverse-lunge', 'Bench Dips', 'plank', 'bicycle-crunch'], 'Room circuit')] }),
  P({ name: 'Bodyweight Legs', category: 'Bodyweight', level: 'intermediate', equipment: 'none',
    blurb: 'Lunges, cossacks, wall sits and jumps.',
    blocks: [S('Bodyweight Walking Lunge'), S('cossack-squat'), S('bw-glute-bridge'), S('wall-sit'), S('Freehand Jump Squat'), S('Single Leg Glute Bridge', 2)] }),
  P({ name: 'Push-Up Progression', category: 'Bodyweight', level: 'beginner', equipment: 'none',
    blurb: 'Incline to floor to decline. Build up to more reps.',
    blocks: [S('Incline Push-Up'), S('pushup'), S('Decline Push-Up', 2), S('Push Up to Side Plank', 2), S('plank', 2)] }),
  P({ name: 'Pull-Up Builder', category: 'Bodyweight', level: 'intermediate', equipment: 'gym',
    blurb: 'Hangs, assisted pull-ups and rows to earn your first (or next) pull-up.',
    blocks: [S('dead-hang'), S('Scapular Pull-Up'), S('Band Assisted Pull-Up'), S('Inverted Row'), S('lat-pulldown')] }),
  P({ name: 'Calisthenics Basics', category: 'Bodyweight', level: 'intermediate', equipment: 'gym',
    blurb: 'Pull-ups, dips, push-ups, squats and leg raises.',
    blocks: [S('Pullups', 4), S('Dips - Triceps Version'), S('pushup'), S('Bodyweight Squat'), S('Hanging Leg Raise')] }),
  P({ name: 'Beginner Bodyweight 20', category: 'Bodyweight', level: 'beginner', equipment: 'none',
    blurb: 'Easy on-ramp: two rounds of simple moves.',
    blocks: [hiit(30, 30, 2, ['Bodyweight Squat', 'Incline Push-Up', 'bw-glute-bridge', 'bird-dog', 'jumping-jacks'], 'Beginner circuit')] }),
  P({ name: 'Bodyweight Core & Cardio', category: 'Bodyweight', level: 'intermediate', equipment: 'none',
    blurb: 'Alternate cardio bursts with core moves.',
    blocks: [hiit(40, 20, 3, ['high-knees', 'v-up', 'skater-hops', 'hollow-hold', 'burpee', 'bicycle-crunch'], 'Core & cardio')] }),
  P({ name: 'Quiet Apartment Workout', category: 'Bodyweight', level: 'beginner', equipment: 'none',
    blurb: 'No jumping, no noise, still a real workout.',
    blocks: [S('Bodyweight Squat'), S('reverse-lunge'), S('pushup'), S('bw-glute-bridge'), S('bird-dog'), S('Superman', 2)] }),

  // ── Kettlebell ───────────────────────────────────────
  P({ name: 'Kettlebell Swing Ladder', category: 'Kettlebell', level: 'intermediate', equipment: 'kettlebell', popular: true,
    blurb: 'EMOM swings: add reps as the minutes go by.',
    blocks: [emom(10, ['kb-swing'], ['10 → 20 swings, +2 each minute'], 'Swing ladder EMOM 10')] }),
  P({ name: 'Kettlebell Full Body', category: 'Kettlebell', level: 'beginner', equipment: 'kettlebell',
    blurb: 'Goblet squat, swing, press, row with one bell.',
    blocks: [S('goblet-squat'), S('kb-swing'), S('Two-Arm Kettlebell Military Press'), S('One-Arm Kettlebell Row'), S('plank', 2)] }),
  P({ name: 'Kettlebell Complex', category: 'Kettlebell', level: 'advanced', equipment: 'kettlebell',
    blurb: 'Swing, clean, press, squat without putting the bell down.',
    blocks: [hiit(40, 20, 4, ['kb-swing', 'Kettlebell Hang Clean', 'Two-Arm Kettlebell Military Press', 'goblet-squat'], 'Complex', 90)] }),
  P({ name: 'Get-Up & Windmill Skills', category: 'Kettlebell', level: 'advanced', equipment: 'kettlebell',
    blurb: 'Slow, controlled strength for shoulders and core.',
    blocks: [S('Kettlebell Turkish Get-Up (Squat Style)', 4), S('Kettlebell Windmill'), S('Kettlebell Arnold Press'), S('kb-swing')] }),
  P({ name: 'Kettlebell Tabata', category: 'Kettlebell', level: 'intermediate', equipment: 'kettlebell',
    blurb: 'Two Tabatas: swings, then goblet squats and presses.',
    blocks: [tabata(['kb-swing'], 'Swing Tabata'), tabata(['goblet-squat', 'Two-Arm Kettlebell Military Press'], 'Squat & press Tabata')] }),
  P({ name: 'Kettlebell + Bodyweight', category: 'Kettlebell', level: 'intermediate', equipment: 'kettlebell',
    blurb: 'Bell moves paired with push-ups and lunges.',
    blocks: [hiit(40, 20, 3, ['kb-swing', 'pushup', 'goblet-squat', 'reverse-lunge', 'Kettlebell Thruster'], 'KB + BW circuit')] }),

  // ── Cardio ───────────────────────────────────────────
  P({ name: '12-3-30 Treadmill Walk', category: 'Cardio', level: 'beginner', equipment: 'cardio machine', popular: true, warmup: false,
    blurb: '12% incline, 3 mph, 30 minutes. The viral incline walk.',
    blocks: [M('treadmill', 30, 'Set incline to 12% and speed to 3.0 mph. Hands off the rails if you can.')] }),
  P({ name: 'Zone 2 Bike', category: 'Cardio', level: 'beginner', equipment: 'cardio machine', popular: true, warmup: false,
    blurb: '40 easy minutes where you can still hold a conversation.',
    blocks: [M('bike', 40, 'Easy effort: you should be able to talk in full sentences.')] }),
  P({ name: 'Zone 2 Walk / Jog', category: 'Cardio', level: 'beginner', equipment: 'cardio machine', warmup: false,
    blurb: 'Steady 45 minutes on the treadmill at a talking pace.',
    blocks: [M('treadmill', 45, 'Talking pace. Walk briskly or jog lightly.')] }),
  P({ name: 'Steady Row 20', category: 'Cardio', level: 'beginner', equipment: 'cardio machine', warmup: false,
    blurb: 'Smooth, steady rowing with good form.',
    blocks: [M('rower', 20)] }),
  P({ name: 'Stair Climber 20', category: 'Cardio', level: 'intermediate', equipment: 'cardio machine', warmup: false,
    blurb: '20 minutes on the stairs. Legs and lungs.',
    blocks: [M('stairs', 20)] }),
  P({ name: 'Elliptical Intervals', category: 'Cardio', level: 'beginner', equipment: 'cardio machine',
    blurb: 'One minute hard, two minutes easy. Low impact.',
    blocks: [intervals('elliptical', 60, 120, 7, 'Elliptical 1 hard / 2 easy')] }),
  P({ name: 'Incline Walk Intervals', category: 'Cardio', level: 'beginner', equipment: 'cardio machine',
    blurb: 'Alternate steep and flat walking.',
    blocks: [intervals('treadmill', 180, 120, 6, 'Steep 3 min / flat 2 min')] }),
  P({ name: 'Run / Walk Starter', category: 'Cardio', level: 'beginner', equipment: 'cardio machine', popular: true,
    blurb: 'Couch-to-5K style: run 60 seconds, walk 90.',
    blocks: [M('treadmill', 5), intervals('Running, Treadmill', 60, 90, 8, 'Run 60s / walk 90s')] }),
  P({ name: 'Weighted Walk (Rucking)', category: 'Cardio', level: 'beginner', equipment: 'none', warmup: false,
    blurb: 'Brisk walk with a weighted backpack or vest. Log it as a walk.',
    blocks: [M('Trail Running/Walking', 45, 'Start with 10–20 lb in a backpack. Brisk pace, tall posture.')] }),
  P({ name: 'Cardio Machine Mix', category: 'Cardio', level: 'beginner', equipment: 'cardio machine', warmup: false,
    blurb: '10 minutes each on treadmill, bike and rower.',
    blocks: [M('treadmill', 10), M('bike', 10), M('rower', 10)] }),
  P({ name: 'Treadmill Sprint Pyramid', category: 'Cardio', level: 'advanced', equipment: 'cardio machine',
    blurb: 'Hard efforts with equal recovery, building up and back down.',
    blocks: [M('treadmill', 5), intervals('Running, Treadmill', 30, 30, 2, '30s / 30s'), intervals('Running, Treadmill', 60, 60, 2, '60s / 60s'), intervals('Running, Treadmill', 90, 90, 2, '90s / 90s'), intervals('Running, Treadmill', 30, 30, 2, '30s / 30s')] }),
  P({ name: 'Run & Lift', category: 'Cardio', level: 'intermediate', equipment: 'gym',
    blurb: 'Hybrid day: 15-minute run, then four strength moves.',
    blocks: [M('Running, Treadmill', 15), S('goblet-squat', 3), S('pushup', 3), S('db-row', 3), S('plank', 2)] }),

  // ── Core & balance ───────────────────────────────────
  P({ name: 'Core Foundations', category: 'Core & balance', level: 'beginner', equipment: 'none', popular: true,
    blurb: 'Dead bugs, bird dogs, planks and bridges. Builds a stable middle.',
    blocks: [S('dead-bug'), S('bird-dog'), S('plank'), S('side-plank', 2), S('bw-glute-bridge', 2)] }),
  P({ name: 'Abs Circuit', category: 'Core & balance', level: 'intermediate', equipment: 'none',
    blurb: 'Fast 40/20 ab circuit, three rounds.',
    blocks: [hiit(40, 20, 3, ['bicycle-crunch', 'v-up', 'Flutter Kicks', 'Russian Twist', 'plank'], 'Ab circuit')] }),
  P({ name: 'Anti-Rotation & Stability', category: 'Core & balance', level: 'intermediate', equipment: 'gym',
    blurb: 'Pallof presses, chops and carries for a strong, steady core.',
    blocks: [S('Pallof Press'), S('Standing Cable Wood Chop'), S("Farmer's Walk"), S('side-plank'), S('dead-bug', 2)] }),
  P({ name: 'Plank Series', category: 'Core & balance', level: 'beginner', equipment: 'none',
    blurb: 'Front, side and moving planks.',
    blocks: [S('plank'), S('side-plank'), S('plank-jack', 2), S('Push Up to Side Plank', 2)] }),
  P({ name: 'Hanging Core', category: 'Core & balance', level: 'advanced', equipment: 'gym',
    blurb: 'Leg raises, hangs and cable crunches.',
    blocks: [S('Hanging Leg Raise', 4), S('dead-hang'), S('cable-crunch'), S('Ab Roller')] }),
  P({ name: 'Pilates-Style Mat Core', category: 'Core & balance', level: 'beginner', equipment: 'none', popular: true,
    blurb: 'Slow, controlled mat work: hollow holds, flutters, bridges.',
    blocks: [S('hollow-hold'), S('Flutter Kicks'), S('bicycle-crunch'), S('Single Leg Glute Bridge'), S('Superman'), S('bird-dog', 2)] }),
  P({ name: 'Balance & Stability', category: 'Core & balance', level: 'beginner', equipment: 'dumbbells',
    blurb: 'Single-leg work and steady holds. Good for knees and ankles.',
    blocks: [S('Dumbbell Step Ups'), S('Single Leg Glute Bridge'), S('bird-dog'), S('side-plank'), S("Farmer's Walk", 2)] }),

  // ── Mobility ─────────────────────────────────────────
  P({ name: 'Morning Mobility 10', category: 'Mobility', level: 'beginner', equipment: 'none', warmup: false, cooldown: false, popular: true,
    blurb: 'Ten minutes to wake up your hips, back and shoulders.',
    blocks: [S("World's Greatest Stretch", 2), S('Cat Stretch', 2), S('thoracic-rotation', 2), S('Inchworm', 2)] }),
  P({ name: 'Desk Worker Reset', category: 'Mobility', level: 'beginner', equipment: 'none', warmup: false, cooldown: false,
    blurb: 'Undo a day of sitting: hip flexors, upper back, chest.',
    blocks: [S('Kneeling Hip Flexor', 2), S('thoracic-rotation', 2), S('Chest And Front Of Shoulder Stretch', 2), S("Child's Pose", 2), S('Band Pull Apart', 2)] }),
  P({ name: 'Post-Run Stretch', category: 'Mobility', level: 'beginner', equipment: 'none', warmup: false, cooldown: false,
    blurb: 'Calves, hamstrings, quads and hips after cardio.',
    blocks: [S('Standing Gastrocnemius Calf Stretch', 2), S('Hamstring Stretch', 2), S('Quad Stretch', 2), S('pigeon-stretch', 2)] }),
  P({ name: 'Full-Body Stretch 20', category: 'Mobility', level: 'beginner', equipment: 'none', warmup: false, cooldown: false,
    blurb: 'A slow head-to-toe stretch session.',
    blocks: [S("World's Greatest Stretch", 2), S('Hamstring Stretch', 2), S('Quad Stretch', 2), S('pigeon-stretch', 2), S('Shoulder Stretch', 2), S('Triceps Stretch', 2), S("Child's Pose", 2)] }),
  P({ name: 'Hip Opener', category: 'Mobility', level: 'beginner', equipment: 'none', warmup: false, cooldown: false,
    blurb: 'Pigeon, cossacks and hip flexor work for tight hips.',
    blocks: [S('Standing Hip Circles', 2), S('cossack-squat', 2), S('pigeon-stretch', 2), S('Kneeling Hip Flexor', 2), S('IT Band and Glute Stretch', 2)] }),
  P({ name: 'Recovery Day Flow', category: 'Mobility', level: 'beginner', equipment: 'none', warmup: false, cooldown: false,
    blurb: 'An easy walk followed by gentle stretching.',
    blocks: [M('Trail Running/Walking', 20), S('Cat Stretch', 2), S('Hamstring Stretch', 2), S("Child's Pose", 2)] }),

  // ── Quick ────────────────────────────────────────────
  P({ name: '10-Minute Express', category: 'Quick', level: 'intermediate', equipment: 'none', warmup: false, cooldown: false, popular: true,
    blurb: 'Two Tabatas and done. For days with no time.',
    blocks: [M('jumping-jacks', 2), tabata(['burpee', 'Bodyweight Squat'], 'Tabata 1'), tabata(['Mountain Climbers', 'pushup'], 'Tabata 2')] }),
  P({ name: '15-Minute Strength Express', category: 'Quick', level: 'beginner', equipment: 'gym', warmup: false,
    blurb: 'Three machines, two sets each.',
    blocks: [S('leg-press', 2), S('chest-press', 2), S('seated-row', 2)] }),
  P({ name: 'Lunch-Break HIIT', category: 'Quick', level: 'intermediate', equipment: 'none', warmup: false,
    blurb: '20 minutes, minimal sweat-time, maximum effort.',
    blocks: [hiit(30, 15, 3, ['jumping-jacks', 'Bodyweight Squat', 'pushup', 'Mountain Climbers', 'plank'], 'Lunch circuit')] }),
  P({ name: '5-Minute Wake-Up', category: 'Quick', level: 'beginner', equipment: 'none', warmup: false, cooldown: false,
    blurb: 'Five gentle minutes to get moving.',
    blocks: [hiit(40, 20, 1, ['jumping-jacks', 'Bodyweight Squat', "World's Greatest Stretch", 'Inchworm', 'bw-glute-bridge'], 'Wake-up')] }),

  // ── Sport prep ───────────────────────────────────────
  P({ name: 'Golf Strength & Rotation', category: 'Sport prep', level: 'intermediate', equipment: 'gym',
    blurb: 'Rotational power, hip hinge and shoulder health for a better swing.',
    blocks: [S('Standing Cable Wood Chop'), S('Russian Twist'), S('rdl'), S('Pallof Press With Rotation'), S('Band Pull Apart'), S('side-plank', 2)] }),
  P({ name: 'Snowboard & Ski Prep', category: 'Sport prep', level: 'intermediate', equipment: 'none',
    blurb: 'Legs, balance and lateral power for the slopes.',
    blocks: [S('Freehand Jump Squat'), S('skater-hops'), S('wall-sit'), S('Lateral Box Jump'), S('reverse-lunge'), S('side-plank', 2)] }),
  P({ name: 'Basketball Conditioning', category: 'Sport prep', level: 'advanced', equipment: 'gym',
    blurb: 'Jumps, lateral shuffles and sprints for court fitness.',
    blocks: [hiit(30, 30, 4, ['Front Box Jump', 'skater-hops', 'Wind Sprints', 'Mountain Climbers'], 'Court conditioning', 90), S('Split Jump', 2)] }),
  P({ name: 'Runner Strength', category: 'Sport prep', level: 'beginner', equipment: 'dumbbells',
    blurb: 'Single-leg strength and calves to run stronger and stay healthy.',
    blocks: [S('Split Squat with Dumbbells'), S('Single Leg Glute Bridge'), S('Dumbbell Step Ups'), S('calf-raise'), S('side-plank', 2)] }),
  P({ name: 'Pickleball & Tennis Prep', category: 'Sport prep', level: 'beginner', equipment: 'none',
    blurb: 'Quick feet, rotation and shoulder care for racket sports.',
    blocks: [S('skater-hops'), S('Russian Twist'), S('reverse-lunge'), S('Band Pull Apart'), S('side-plank', 2)] }),
];

// ── resolve names to exercise ids ──
let byName: Map<string, string> | null = null;
export function resolveMove(nameOrId: string): string | null {
  if (EXERCISES[nameOrId]) return nameOrId;
  if (!byName) byName = new Map(Object.values(EXERCISES).map((e) => [e.name.toLowerCase(), e.id]));
  return byName.get(nameOrId.toLowerCase()) ?? null;
}
export const resetResolver = () => { byName = null; };

/** Names that don't resolve (used by the check script and to hide broken programs). */
export function unresolved(p: Program): string[] {
  const names = p.blocks.flatMap((b) => ('interval' in b ? b.interval.moves : [b.ex]));
  return names.filter((n) => !resolveMove(n));
}

import type { TemplateItem } from './exercises';
/** Turn a program into session items with resolved exercise ids. */
export function programItems(p: Program): TemplateItem[] {
  const items: TemplateItem[] = [];
  if (p.warmup) items.push({ exerciseId: 'treadmill', role: 'warmup', minutes: 5 });
  for (const b of p.blocks) {
    if ('interval' in b) {
      items.push({ exerciseId: 'interval-block', role: 'main', interval: { ...b.interval, moves: b.interval.moves.map((m) => resolveMove(m) ?? m) } });
    } else {
      const id = resolveMove(b.ex);
      if (id) items.push({ exerciseId: id, role: 'main', sets: b.sets, minutes: b.minutes, hint: b.hint });
    }
  }
  return items;
}
