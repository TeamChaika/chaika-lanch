import type { MealNutrition as Nutrition } from '@/data/menu';

const format = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });

export function MealNutrition({ value }: { value?: Nutrition }) {
  const complete = !!value && [value.calories, value.protein, value.fat, value.carbs].every(v => v !== null);
  const metrics = [
    { label: 'Калории', value: value?.calories, unit: 'ккал' },
    { label: 'Белки', value: value?.protein, unit: 'г' },
    { label: 'Жиры', value: value?.fat, unit: 'г' },
    { label: 'Углеводы', value: value?.carbs, unit: 'г' },
  ];
  return <section className="meal-nutrition" aria-label="КБЖУ обеда">
    <div className="nutrition-heading"><strong>КБЖУ</strong><span>На весь обед с напитком</span></div>
    <dl className="nutrition-values">{metrics.map(metric => <div key={metric.label}>
      <dt>{metric.label}</dt>
      <dd>{complete && metric.value != null ? <>{format.format(metric.value)} <small>{metric.unit}</small></> : '—'}</dd>
    </div>)}</dl>
    {(!complete || value?.estimated) && <p className="nutrition-note">{complete ? 'Приблизительные значения' : 'Данные уточняются'}</p>}
  </section>;
}
