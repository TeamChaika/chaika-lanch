import { z } from 'zod';
import manifest from '@/data/image-manifest.json';
import type { MenuCatalog } from '@/data/menu';
import { getMealNutrition } from './nutrition';

const text = (max: number) => z.string().trim().min(1, 'Заполните поле').max(max);
const variant = z.object({
  width: z.number().int().min(1).max(1280), height: z.number().int().min(1).max(2560),
  path: z.string().regex(/^\/images\/uploads\/[a-f0-9-]{36}-\d{1,4}\.webp$/),
  bytes: z.number().int().positive().max(5_000_000),
}).strict();
const nutrition = z.object({
  calories: z.number().min(0).max(10000).nullable(),
  protein: z.number().min(0).max(1000).nullable(),
  fat: z.number().min(0).max(1000).nullable(),
  carbs: z.number().min(0).max(1000).nullable(),
  estimated: z.boolean(),
}).strict().superRefine((value, ctx) => {
  const values = [value.calories, value.protein, value.fat, value.carbs];
  if (values.some(v => v !== null) && values.some(v => v === null)) {
    ctx.addIssue({ code: 'custom', message: 'Заполните все четыре значения КБЖУ или оставьте все поля пустыми' });
  }
});
export const catalogSchema = z.object({
  schemaVersion: z.literal(1), revision: text(100), updatedAt: z.string().datetime().nullable(),
  cycleStartsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
  }, 'Первая неделя должна начинаться в понедельник'),
  closedDays: z.array(z.string().regex(/^[1-4]-[1-5]$/)).max(20),
  meals: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,80}$/), name: text(160), description: z.string().trim().max(1000),
    price: z.number().int().min(1, 'Цена должна быть больше нуля').max(100000),
    image: z.string().max(200), imageVariants: z.array(variant).min(1).max(5).optional(),
    imageIsExample: z.boolean().optional(), enabled: z.boolean().optional(),
    tag: z.string().trim().max(80), week: z.number().int().min(1).max(4), weekday: z.number().int().min(1).max(5),
    dishes: z.array(z.object({ category: text(50), name: text(300), weight: z.number().int().min(1).max(10000), nutrition: nutrition.optional() }).strict()).min(1, 'Добавьте хотя бы одну позицию').max(12),
    nutrition: nutrition.optional(),
    nutritionMode: z.enum(['manual', 'dishes']).optional(),
  }).strict().superRefine((meal, ctx) => {
    if (Object.hasOwn(manifest, meal.image) && !meal.imageVariants) return;
    const match = /^\/images\/uploads\/([a-f0-9-]{36})\.webp$/.exec(meal.image);
    if (!match || !meal.imageVariants?.length || meal.imageVariants.some((v) => v.path !== `/images/uploads/${match[1]}-${v.width}.webp`)) {
      ctx.addIssue({ code: 'custom', message: 'Выберите фото из библиотеки или загрузите новое', path: ['image'] });
    }
  })).max(200),
}).strict().superRefine((catalog, ctx) => {
  if (new Set(catalog.meals.map((meal) => meal.id)).size !== catalog.meals.length) ctx.addIssue({ code: 'custom', message: 'Идентификаторы комплексов повторяются', path: ['meals'] });
});
export function validateCatalog(input: unknown): MenuCatalog {
  const catalog = catalogSchema.parse(input);
  return { ...catalog, meals: catalog.meals.map(meal => {
    if (meal.nutritionMode !== 'dishes') return meal;
    const total = getMealNutrition(meal);
    return { ...meal, nutrition: total ? nutrition.parse(total) : undefined };
  }) };
}
