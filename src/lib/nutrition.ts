import type { Dish, Meal, MealNutrition } from '@/data/menu';

type CompleteNutrition = { [Key in keyof MealNutrition]: NonNullable<MealNutrition[Key]> };
export function hasNutrition(value?: MealNutrition): value is CompleteNutrition {
  return !!value && [value.calories, value.protein, value.fat, value.carbs].every(v => typeof v === 'number' && Number.isFinite(v));
}

// Never display a partial sum as the nutrition of a complete lunch.
export function sumDishNutrition(dishes: Dish[]): MealNutrition | undefined {
  if (!dishes.length || dishes.some(dish => !hasNutrition(dish.nutrition))) return undefined;
  const values = dishes.map(dish => dish.nutrition!);
  const sum = (key: 'calories' | 'protein' | 'fat' | 'carbs') => Math.round(values.reduce((total, value) => total + value[key]!, 0) * 10) / 10;
  return { calories: sum('calories'), protein: sum('protein'), fat: sum('fat'), carbs: sum('carbs'), estimated: values.some(value => value.estimated) };
}

export function getMealNutrition(meal: Meal): MealNutrition | undefined {
  return meal.nutritionMode === 'dishes' ? sumDishNutrition(meal.dishes) : meal.nutrition;
}

