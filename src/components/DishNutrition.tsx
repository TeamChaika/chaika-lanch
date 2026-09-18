import type { MealNutrition } from '@/data/menu';
import { hasNutrition } from '@/lib/nutrition';

const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export function DishNutrition({ value }: { value?: MealNutrition }) {
  if (!hasNutrition(value)) return null;
  return <span className="dish-nutrition" aria-label="КБЖУ на порцию">
    <span>{value.estimated ? '≈ ' : ''}{format.format(value.calories)} ккал</span>
    <span>Б {format.format(value.protein)} г</span>
    <span>Ж {format.format(value.fat)} г</span>
    <span>У {format.format(value.carbs)} г</span>
  </span>;
}
