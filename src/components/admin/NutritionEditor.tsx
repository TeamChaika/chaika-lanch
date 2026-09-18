import type { MealNutrition } from '@/data/menu';

const empty: MealNutrition = { calories: null, protein: null, fat: null, carbs: null, estimated: false };
const fields = [
  { key: 'calories', label: 'Калории, ккал', max: 10000 },
  { key: 'protein', label: 'Белки, г', max: 1000 },
  { key: 'fat', label: 'Жиры, г', max: 1000 },
  { key: 'carbs', label: 'Углеводы, г', max: 1000 },
] as const;

export function NutritionEditor({ value, onChange, portion }: { value?: MealNutrition; onChange: (value: MealNutrition) => void; portion?: number }) {
  const nutrition = value ?? empty;
  return <fieldset className="admin-nutrition">
    <legend>{portion === undefined ? 'КБЖУ обеда' : 'КБЖУ блюда'}</legend>
    <p>{portion === undefined ? 'На весь комплекс с напитком, без подарочной выпечки.' : `На порцию ${portion} г, не на 100 г.`} Заполните все четыре поля или оставьте все пустыми.</p>
    <div className="admin-nutrition-fields">{fields.map(field => <label className="field" key={field.key}>{field.label}
      <input type="number" inputMode="decimal" min={0} max={field.max} step="0.1" placeholder="Не указано" value={nutrition[field.key] ?? ''}
        onChange={event => onChange({ ...nutrition, [field.key]: event.target.value === '' ? null : Number(event.target.value) })} />
    </label>)}</div>
    <label className="admin-checkbox"><input type="checkbox" checked={nutrition.estimated} onChange={event => onChange({ ...nutrition, estimated: event.target.checked })} />Приблизительный расчёт</label>
  </fieldset>;
}
