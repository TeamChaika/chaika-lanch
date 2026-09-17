'use client';

import { FoodImage } from './FoodImage';
import { FormEvent, useState } from 'react';
import { ArrowRight, CalendarDays, Check, CheckCircle2, ChevronDown, CreditCard, MapPin, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { findMeal, Meal, mealsForDate, money } from '@/data/menu';
import { City, site } from '@/data/site';
import { CartItem, cartTotal, DeliveryAddress, DeliveryDay, formatDate, itemKey, weeklyGiftStatus } from '@/lib/order';
import { Dialog } from './Dialog';
import { Quantity } from './MealCard';
import { WeeklyGiftCard, WeeklyGiftSummary } from './WeeklyGift';

type Close = { onClose: () => void };

export function ProductDialog({ meal, date, onAdd, onClose }: Close & { meal: Meal; date: string; onAdd: (quantity: number) => void }) {
  const [quantity, setQuantity] = useState(1);
  return <Dialog title="Состав обеда" onClose={onClose}>
    <div className="dialog-scroll product-scroll">
      <FoodImage src={meal.image} alt={meal.description} width={1000} height={667} className="product-hero" eager sizes="(max-width: 700px) 100vw, 620px" />
      <div className="dialog-content">
        <span className="eyebrow">{meal.tag}</span><h3 className="product-heading">{meal.name}</h3>
        <p className="muted">Полный обед · {meal.dishes.reduce((sum, dish) => sum + dish.weight, 0)} г</p>
        <h4>Что внутри</h4>
        <ul className="dish-list">{meal.dishes.map((dish, index) => <li key={dish.name}><span className="dish-number">0{index + 1}</span><span>{dish.name}</span><span className="muted">{dish.weight} г</span></li>)}</ul>
        <details className="ingredients"><summary>Состав и аллергены <ChevronDown size={18} /></summary><p>{meal.ingredients}</p><p><strong>Аллергены:</strong> {meal.allergens}</p></details>
        <div className="soft-note"><CalendarDays size={19} /> {date ? formatDate(date) : 'Выберите день в меню'}</div>
      </div>
    </div>
    <footer className="dialog-footer split-footer"><Quantity value={quantity} label={meal.name} onDecrease={() => setQuantity((value) => Math.max(1, value - 1))} onIncrease={() => setQuantity((value) => Math.min(99, value + 1))} /><button className="button button-primary" disabled={!date} onClick={() => onAdd(quantity)}>Добавить · {money(meal.price * quantity)} <PlusSign /></button></footer>
  </Dialog>;
}

function PlusSign() { return <span aria-hidden="true" className="plus-sign">+</span>; }

export function AddressDialog({ city, address, onSave, onClose }: Close & { city: City; address: DeliveryAddress | null; onSave: (value: DeliveryAddress) => void }) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({ city: String(data.get('city')), street: String(data.get('street')).trim(), office: String(data.get('office')).trim(), floor: String(data.get('floor')).trim() });
  }
  return <Dialog title="Адрес доставки" onClose={onClose}><form onSubmit={submit} className="dialog-form">
    <div className="dialog-content"><p className="muted">Сохраним адрес для текущего заказа.</p>
      <label className="field">Город<select name="city" defaultValue={address?.city ?? city}>{site.cities.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field">Улица и дом<input name="street" autoComplete="street-address" placeholder="Например, ул. Ленина, 12" defaultValue={address?.street} required minLength={5} maxLength={150} /></label>
      <div className="field-grid"><label className="field">Офис / квартира<input name="office" defaultValue={address?.office} maxLength={20} /></label><label className="field">Этаж<input name="floor" inputMode="numeric" defaultValue={address?.floor} maxLength={5} /></label></div>
      <p className="form-note">В макете доставка стоит {money(site.deliveryFee)} за каждый день заказа. Проверка реальных зон будет доступна после подключения доставки.</p>
    </div><footer className="dialog-footer"><button className="button button-primary full-width" type="submit">Сохранить адрес <ArrowRight size={18} /></button></footer>
  </form></Dialog>;
}

export function WeekDialog({ days, onAdd, onClose }: Close & { days: DeliveryDay[]; onAdd: (selection: { date: string; mealId: string }[]) => void }) {
  const [selection, setSelection] = useState<Record<string, string>>(() => Object.fromEntries(days.map((day, index) => {
    const options = mealsForDate(day.value);
    return [day.value, options[index % options.length]?.id ?? ''];
  })));
  const selected = days.filter((day) => mealsForDate(day.value).some((meal) => meal.id === selection[day.value]));
  const total = selected.reduce((sum, day) => sum + (findMeal(selection[day.value])?.price ?? 0), 0);
  return <Dialog title="Обеды на неделю" onClose={onClose}>
    <div className="dialog-content dialog-scroll"><p className="muted">Каждый день — своё меню. Выберите обеды на все 5 рабочих дней и получите выпечку в подарок. Любой день можно пропустить.</p>
      <WeeklyGiftCard items={selected.map((day) => ({ date: day.value, quantity: 1 }))} />
      <div className="week-list">{days.map((day) => { const meal = findMeal(selection[day.value]); return <div className={`week-row ${!meal ? 'week-row-skipped' : ''}`} key={day.value}>
        <div className="week-date"><span>{day.short}</span><strong>{day.number}</strong></div>
        {meal ? <FoodImage src={meal.image} alt="" width={80} height={80} sizes="100px" /> : <CalendarDays size={35} className="muted" />}
        <label className="week-select"><span className="sr-only">Обед на {day.full}</span><select value={selection[day.value]} onChange={(event) => setSelection((current) => ({ ...current, [day.value]: event.target.value }))}>{mealsForDate(day.value).map((option) => <option key={option.id} value={option.id}>{option.name} · {money(option.price)}</option>)}<option value="">Пропустить день</option></select></label>
      </div>; })}</div>
      <div className="soft-note"><Truck size={20} /><span>Доставка рассчитывается отдельно для каждого дня.</span></div>
    </div><footer className="dialog-footer"><div className="total-row"><span>Дней с обедом: {selected.length}</span><strong>{money(total)}</strong></div><button className="button button-primary full-width" disabled={!selected.length} onClick={() => onAdd(selected.map((day) => ({ date: day.value, mealId: selection[day.value] })))}>Добавить в корзину <ArrowRight size={18} /></button></footer>
  </Dialog>;
}

export function CartDialog({ items, city, address, onChange, onRemove, onCheckout, onClose }: Close & { items: CartItem[]; city: City; address: DeliveryAddress | null; onChange: (item: CartItem, delta: number) => void; onRemove: (item: CartItem) => void; onCheckout: () => void }) {
  const dates = new Set(items.map((item) => item.date)).size;
  const delivery = address ? dates * site.deliveryFee : 0;
  return <Dialog title="Ваша корзина" onClose={onClose}>
    {!items.length ? <div className="empty-state"><ShoppingBag size={44} strokeWidth={1.2} /><h3>Здесь будет ваш обед</h3><p className="muted">Выберите понравившийся комплект в меню.</p><button className="button button-primary" onClick={onClose}>Перейти к меню <ArrowRight size={18} /></button></div> : <>
      <div className="dialog-content dialog-scroll"><div className="soft-note cart-address"><MapPin size={19} /><span>{city}{address ? `, ${address.street}` : ' · адрес при оформлении'}</span></div>
        <WeeklyGiftCard items={items} />
        <div className="cart-items">{items.map((item) => { const meal = findMeal(item.mealId)!; return <article className="cart-item" key={itemKey(item)}>
          <FoodImage src={meal.image} alt={meal.description} width={120} height={120} sizes="180px" />
          <div className="cart-item-info"><span className="cart-date">{formatDate(item.date)}</span><h3>{meal.name}</h3><p className="muted">{money(meal.price)} за обед</p><div className="cart-item-bottom"><Quantity value={item.quantity} label={`${meal.name}, ${formatDate(item.date)}`} onDecrease={() => onChange(item, -1)} onIncrease={() => onChange(item, 1)} /><strong>{money(meal.price * item.quantity)}</strong></div></div>
          <button className="icon-button remove-item" aria-label={`Удалить ${meal.name}, ${formatDate(item.date)}`} onClick={() => onRemove(item)}><Trash2 size={17} /></button>
        </article>; })}</div>
        <p className="cart-help">В каждом комплекте суп, горячее с гарниром и салат. Всё уже собрано для вашего обеда.</p>
      </div><footer className="dialog-footer"><div className="summary-row"><span>Обеды, {items.reduce((sum, item) => sum + item.quantity, 0)} шт.</span><span>{money(cartTotal(items))}</span></div><div className="summary-row"><span>Доставка{dates > 1 ? `, ${dates} дн.` : ''}</span><span>{address ? money(delivery) : 'После ввода адреса'}</span></div><div className="total-row"><span>{address ? 'Итого' : 'За обеды'}</span><strong>{money(cartTotal(items) + delivery)}</strong></div><button className="button button-primary full-width" onClick={onCheckout}>Оформить заказ <ArrowRight size={18} /></button></footer>
    </>}
  </Dialog>;
}

export interface OrderPreview { name: string; address: DeliveryAddress; slot: string; payment: string; items: CartItem[]; total: number; delivery: number }

export function CheckoutDialog({ items, city, address, onConfirm, onBack, onClose }: Close & { items: CartItem[]; city: City; address: DeliveryAddress | null; onConfirm: (order: OrderPreview) => void; onBack: () => void }) {
  const [payment, setPayment] = useState('Картой');
  const [error, setError] = useState('');
  const dates = [...new Set(items.map((item) => item.date))].sort();
  const delivery = dates.length * site.deliveryFee;
  const total = cartTotal(items) + delivery;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const phone = String(data.get('phone')).replace(/\D/g, '');
    if (!/^[78]\d{10}$/.test(phone)) { setError('Введите российский номер: +7 и ещё 10 цифр.'); return; }
    const street = String(data.get('street')).trim();
    const name = String(data.get('name')).trim();
    if (street.length < 5 || name.length < 2) { setError('Укажите имя и полный адрес с номером дома.'); return; }
    if (!items.length) { setError('Добавьте хотя бы один обед.'); return; }
    onConfirm({ name, address: { city: String(data.get('city')), street, office: String(data.get('office')).trim(), floor: String(data.get('floor')).trim() }, slot: String(data.get('slot')), payment, items: items.map((item) => ({ ...item })), total, delivery });
  }
  return <Dialog title="Оформление заказа" onClose={onClose} onBack={onBack}><form onSubmit={submit} className="dialog-form">
    <div className="dialog-content dialog-scroll"><div className="demo-notice">Демонстрация оформления. Заказ не отправится, оплаты нет.</div><h3 className="form-heading">Куда привезти</h3>
      <label className="field">Город<select name="city" defaultValue={address?.city ?? city}>{site.cities.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="field">Улица и дом<input name="street" defaultValue={address?.street} autoComplete="street-address" placeholder="Например, ул. Ленина, 12" required minLength={5} maxLength={150} /></label>
      <div className="field-grid"><label className="field">Офис / квартира<input name="office" defaultValue={address?.office} maxLength={20} /></label><label className="field">Этаж<input name="floor" defaultValue={address?.floor} inputMode="numeric" maxLength={5} /></label></div>
      <h3 className="form-heading">Когда</h3><div className="soft-note"><CalendarDays size={18} /><span>{dates.map(formatDate).join(', ')}</span></div>
      <label className="field">Интервал доставки<select name="slot">{site.deliverySlots.map((slot) => <option key={slot}>{slot}</option>)}</select></label>
      <h3 className="form-heading">Ваши контакты</h3><div className="field-grid"><label className="field">Имя<input name="name" autoComplete="given-name" placeholder="Как к вам обращаться" minLength={2} maxLength={60} required /></label><label className="field">Телефон<input name="phone" type="tel" autoComplete="tel" inputMode="tel" placeholder="+7 (___) ___-__-__" required maxLength={20} aria-describedby={error ? 'checkout-error' : undefined} /></label></div>
      <fieldset className="payment-fieldset"><legend>Способ оплаты</legend><div className="payment-options">{['Картой', 'СБП'].map((method) => <label className={payment === method ? 'selected' : ''} key={method}><input type="radio" name="payment" value={method} checked={payment === method} onChange={() => setPayment(method)} /><CreditCard size={19} />{method}</label>)}</div></fieldset>
      {error && <p className="error-message" role="alert" id="checkout-error">{error}</p>}
    </div><footer className="dialog-footer"><div className="summary-row"><span>Обеды</span><span>{money(cartTotal(items))}</span></div><WeeklyGiftSummary items={items} /><div className="summary-row"><span>Доставка, {dates.length} дн.</span><span>{money(delivery)}</span></div><div className="total-row"><span>Итого</span><strong>{money(total)}</strong></div><button className="button button-primary full-width" type="submit">Посмотреть подтверждение <ArrowRight size={18} /></button></footer>
  </form></Dialog>;
}

export function ConfirmationDialog({ order, onClose }: Close & { order: OrderPreview }) {
  return <Dialog title="Подтверждение" onClose={onClose}><div className="dialog-content dialog-scroll confirmation">
    <CheckCircle2 size={58} strokeWidth={1.5} /><h3>Демо-заказ собран</h3><p className="muted">{order.name}, так будет выглядеть подтверждение вашего заказа. Ничего не отправлено, оплата не списывалась.</p>
    {weeklyGiftStatus(order.items).eligible && <WeeklyGiftCard items={order.items} />}
    <div className="confirmation-address"><CalendarDays size={22} /><div>{[...new Set(order.items.map((item) => item.date))].sort().map(formatDate).join(', ')}<strong>{order.slot}</strong></div><MapPin size={22} /><div>{order.address.city}, {order.address.street}<span>{[order.address.office && `Офис / квартира ${order.address.office}`, order.address.floor && `этаж ${order.address.floor}`].filter(Boolean).join(', ')}</span></div></div>
    {order.items.map((item) => <div className="summary-row" key={itemKey(item)}><span>{findMeal(item.mealId)?.name} × {item.quantity}<small>{formatDate(item.date)}</small></span><span>{money(findMeal(item.mealId)!.price * item.quantity)}</span></div>)}
    <div className="summary-row"><span>Доставка</span><span>{money(order.delivery)}</span></div><div className="total-row"><span>Сумма заказа</span><strong>{money(order.total)}</strong></div>
  </div><footer className="dialog-footer"><button className="button button-primary full-width" onClick={onClose}>Вернуться в меню <ArrowRight size={18} /></button></footer></Dialog>;
}

export function BusinessDialog({ city, onClose }: Close & { city: City }) {
  const [count, setCount] = useState(10);
  const [submitted, setSubmitted] = useState(false);
  return <Dialog title="Обеды для вашей команды" onClose={onClose}><div className="dialog-content dialog-scroll">
    {!submitted ? <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}><p className="muted">Посмотрите пример стоимости питания команды. Доставка рассчитывается отдельно.</p><label className="field">Город<select defaultValue={city}>{site.cities.map((value) => <option key={value}>{value}</option>)}</select></label><label className="field">Количество сотрудников<input type="number" value={count} min={1} max={500} onChange={(event) => setCount(Number(event.target.value))} required /></label><div className="business-estimate"><span>За один рабочий день</span><strong>{money(Math.max(0, count) * 450)} – {money(Math.max(0, count) * 550)}</strong><span>Из расчёта 450–550 ₽ за обед</span></div><div className="demo-notice">Это предварительный расчёт в макете. Заявка никуда не отправляется.</div><button type="submit" className="button button-primary full-width">Составить заявку <ArrowRight size={18} /></button></form> : <div className="business-result"><Check size={36} /><h3>Основа заявки готова</h3><p>Обеды для {count} сотрудников. Следующий шаг — согласовать дни, адрес и состав меню с вашей командой.</p><p className="muted">Для реальных заявок подключите форму к вашей системе заказов.</p><button className="button button-primary" onClick={onClose}>Понятно</button></div>}
  </div></Dialog>;
}
