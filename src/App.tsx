import { Activity, Dumbbell, HeartPulse, House, MessageCircle, Utensils } from 'lucide-react';
import { useStore, type Tab } from './store';
import Home from './screens/Home';
import Train from './screens/Train';
import Progress from './screens/Progress';
import Wellness from './screens/Wellness';
import Coach from './screens/Coach';
import Settings from './screens/Settings';
import Builder from './screens/Builder';
import Programs from './screens/Programs';
import Food from './screens/Food';
import Week from './screens/Week';
import Recipes from './screens/Recipes';
import Goal from './screens/Goal';
import MealPlan from './screens/MealPlan';
import { cx } from './components/ui';
import { useEffect, useState } from 'react';
import { clock, elapsedMs } from './screens/Session';
import { AutoFinish } from './components/AutoFinish';

function NavClock() {
  const { data } = useStore();
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const a = data.active;
  if (!a || a.backfill || !a.workout.startedAt) return null;
  return <span className={cx('absolute left-1/2 top-1 -translate-x-1/2 rounded-full px-1.5 text-[10px] font-semibold tabular-nums', a.pausedAt != null ? 'bg-sun text-ink' : 'bg-tide text-ink')}>{clock(elapsedMs(a))}</span>;
}

const NAV: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'home', label: 'Home', icon: House },
  { id: 'train', label: 'Train', icon: Dumbbell },
  { id: 'food', label: 'Food', icon: Utensils },
  { id: 'progress', label: 'Progress', icon: Activity },
  { id: 'wellness', label: 'Wellness', icon: HeartPulse },
  { id: 'coach', label: 'Coach', icon: MessageCircle },
];

export default function App() {
  const { tab, go, data } = useStore();
  const Screen = { home: Home, train: Train, progress: Progress, wellness: Wellness, coach: Coach, settings: Settings, builder: Builder, programs: Programs, food: Food, week: Week, recipes: Recipes, goal: Goal, mealplan: MealPlan }[tab];
  return (
    <div className="min-h-full">
      <AutoFinish />
      <main><Screen /></main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-rim bg-ink/95 backdrop-blur pb-safe" aria-label="Main">
        <ul className="mx-auto grid max-w-xl grid-cols-6">
          {NAV.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button onClick={() => go(id)} aria-current={tab === id || (((tab === 'builder' || tab === 'programs') && id === 'train') || ((tab === 'recipes' || tab === 'mealplan') && id === 'food')) ? 'page' : undefined}
                className={cx('relative flex h-[76px] w-full flex-col items-center justify-center gap-1 text-[11px]', tab === id || (((tab === 'builder' || tab === 'programs') && id === 'train') || ((tab === 'recipes' || tab === 'mealplan') && id === 'food')) ? 'text-sun' : 'text-haze')}>
                <Icon size={22} />
                {label}
                {id === 'train' && data.active && (data.active.backfill || !data.active.workout.startedAt ? <span className="absolute right-[30%] top-4 h-2 w-2 rounded-full bg-tide" aria-label="Workout in progress" /> : <NavClock />)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
