import type { Food, Macros } from '../types';
import { supabase } from './cloud';

export type Goal = 'protein' | 'carbs' | 'lean' | 'balanced';
export const GOAL_INFO: Record<Goal, { label: string; hint: string }> = {
  protein: { label: 'Protein heavy', hint: '35 g+ protein per serving' },
  carbs: { label: 'Carb loader', hint: '75 g+ carbs, 20 g+ protein' },
  lean: { label: 'Lean', hint: '30 g+ protein, under 15 g fat' },
  balanced: { label: 'Balanced', hint: '25 g+ protein, moderate fat' },
};
export const PROTEIN_OPTIONS = [
  { id: '', label: 'Any' }, { id: 'chicken', label: 'Chicken' }, { id: 'beef', label: 'Beef' }, { id: 'pork', label: 'Pork' },
  { id: 'turkey', label: 'Turkey' }, { id: 'seafood', label: 'Seafood' }, { id: 'eggs', label: 'Eggs' },
];

export const CUISINE_OPTIONS = [
  { id: '', label: 'Any' }, { id: 'vietnamese', label: 'Vietnamese' }, { id: 'japanese', label: 'Japanese' }, { id: 'thai', label: 'Thai' },
  { id: 'korean', label: 'Korean' }, { id: 'chinese', label: 'Chinese' }, { id: 'indian', label: 'Indian' }, { id: 'mexican', label: 'Mexican' },
  { id: 'latin american', label: 'Latin American' }, { id: 'italian', label: 'Italian' }, { id: 'mediterranean', label: 'Mediterranean' },
  { id: 'greek', label: 'Greek' }, { id: 'middle eastern', label: 'Middle Eastern' }, { id: 'american', label: 'American' },
  { id: 'southern', label: 'Southern' }, { id: 'cajun', label: 'Cajun' }, { id: 'caribbean', label: 'Caribbean' },
  { id: 'french', label: 'French' }, { id: 'spanish', label: 'Spanish' },
];

export interface Recipe {
  id: string; title: string; image: string | null; readyInMinutes: number | null; servings: number; sourceUrl: string | null;
  perServing: Macros; gramsPerServing: number | null; ingredients: string[]; steps: string[]; diets: string[];
}

export async function searchRecipes(p: { goal: Goal; protein: string; cuisine: string; maxKcal: number; type: string; q: string; offset: number }) {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  const qs = new URLSearchParams({ goal: p.goal, protein: p.protein, cuisine: p.cuisine, maxKcal: String(p.maxKcal || ''), type: p.type, q: p.q, offset: String(p.offset) });
  const r = await fetch(`/api/recipes/search?${qs}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!(r.headers.get('content-type') ?? '').includes('application/json')) throw new Error('Recipe search runs on Vercel. It isn’t available in this preview.');
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? 'Recipe search failed.');
  return body as { recipes: Recipe[]; total: number };
}

/** A recipe as a loggable food: one serving = its weight (or a nominal 100 g when weight is unknown). */
export function recipeToFood(r: Recipe): Food {
  const g = r.gramsPerServing ?? 100;
  const f = 100 / g;
  const per = (v: number | null, d = 1) => (v == null ? null : Math.round(v * f * 10 ** d) / 10 ** d);
  return {
    id: r.id, name: r.title, source: 'recipe', favorite: true,
    per100g: { kcal: Math.round(r.perServing.kcal * f * 10) / 10, protein: per(r.perServing.protein)!, carbs: per(r.perServing.carbs)!, fat: per(r.perServing.fat)!,
      fiber: per(r.perServing.fiber), sugar: per(r.perServing.sugar), sodiumMg: per(r.perServing.sodiumMg, 0) },
    servings: [{ label: r.gramsPerServing ? `1 serving (${Math.round(g)} g)` : '1 serving', grams: g }],
    recipe: { image: r.image, readyInMinutes: r.readyInMinutes, servings: r.servings, sourceUrl: r.sourceUrl, ingredients: r.ingredients, steps: r.steps, perServing: r.perServing },
  };
}

export const foodToRecipe = (f: Food): Recipe | null => f.recipe ? {
  id: f.id, title: f.name, image: f.recipe.image, readyInMinutes: f.recipe.readyInMinutes, servings: f.recipe.servings, sourceUrl: f.recipe.sourceUrl,
  perServing: f.recipe.perServing, gramsPerServing: f.servings[0]?.label.includes('g)') ? f.servings[0].grams : null,
  ingredients: f.recipe.ingredients, steps: f.recipe.steps, diets: [],
} : null;
