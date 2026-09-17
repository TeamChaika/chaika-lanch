import { FoodImage } from './FoodImage';
import { ArrowUpRight, Minus, Plus } from 'lucide-react';
import { Meal, money } from '@/data/menu';

export function Quantity({ value, onDecrease, onIncrease, label = 'Количество' }: { value: number; onDecrease: () => void; onIncrease: () => void; label?: string }) {
  return <div className="quantity" role="group" aria-label={label}>
    <button type="button" onClick={onDecrease} aria-label={`Уменьшить: ${label}`}><Minus size={17} /></button>
    <span aria-live="polite">{value}</span>
    <button type="button" onClick={onIncrease} disabled={value >= 99} aria-label={`Увеличить: ${label}`}><Plus size={17} /></button>
  </div>;
}

export function MealCard({ meal, quantity, onOpen, onAdd, onRemove, wide = false, eager = false }: { wide?: boolean; eager?: boolean; meal: Meal; quantity: number; onOpen: () => void; onAdd: () => void; onRemove: () => void }) {
  return <article className="meal-card">
    <button className="meal-photo-button" type="button" onClick={onOpen} aria-label={`Состав обеда ${meal.name}`}>
      <FoodImage src={meal.image} alt={meal.description} width={1000} height={667} className="meal-photo" eager={eager} sizes={wide ? "(max-width: 700px) calc(100vw - 36px), (max-width: 1320px) 46vw, 610px" : "(max-width: 700px) calc(100vw - 36px), (max-width: 1320px) 30vw, 400px"} />
      <span className="meal-tag">{meal.tag}</span>
      <span className="photo-arrow"><ArrowUpRight size={20} /></span>
    </button>
    <div className="meal-card-body">
      <button type="button" className="meal-title" onClick={onOpen}>{meal.name}</button>
      <p>{meal.description}</p>
      <div className="meal-meta"><span>{meal.dishes.reduce((sum, dish) => sum + dish.weight, 0)} г</span><span>Суп + горячее + салат</span></div>
      <div className="meal-card-bottom"><strong>{money(meal.price)}</strong>
        {quantity ? <Quantity value={quantity} onDecrease={onRemove} onIncrease={onAdd} label={meal.name} /> : <button type="button" className="button button-primary add-button" onClick={onAdd}>Добавить <Plus size={17} /></button>}
      </div>
    </div>
  </article>;
}
