'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, CalendarDays, ChevronDown, Clock3, Heart, Leaf, MapPin, Menu, PackageCheck, ShoppingBag, Sparkles, Truck, Users, Utensils } from 'lucide-react';
import { meals, mealsForDate, money } from '@/data/menu';
import { City, site } from '@/data/site';
import { cartTotal, DeliveryAddress } from '@/lib/order';
import { MealCard } from './MealCard';
import { Dialog } from './Dialog';
import { AddressDialog, BusinessDialog, CartDialog, CheckoutDialog, ConfirmationDialog, OrderPreview, ProductDialog, WeekDialog } from './OrderDialogs';
import { useCart } from './useCart';
import { WeeklyOffer } from './WeeklyGift';
import { FoodImage } from './FoodImage';

type Modal = 'cart' | 'checkout' | 'confirmation' | 'address' | 'week' | 'business' | 'navigation' | null;

export function Storefront() {
  const cart = useCart();
  const [city, setCity] = useState<City>('Ялта');
  const [address, setAddress] = useState<DeliveryAddress | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [product, setProduct] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderPreview | null>(null);
  const [toast, setToast] = useState('');
  const total = cartTotal(cart.items);
  const count = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const meal = meals.find((entry) => entry.id === product);
  const dailyMeals = mealsForDate(cart.date);
  const close = () => { setModal(null); setProduct(null); };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function add(mealId: string, quantity = 1) {
    cart.add(mealId, cart.date, quantity);
    setToast('Обед добавлен в корзину');
  }

  return <>
    <a className="skip-link" href="#menu">Перейти к меню</a>
    <header className="site-header"><div className="header-content container">
      <a href="#" className="logo" aria-label={`${site.name} — на главную`}><Image src={site.logo} alt={site.name} width={175} height={62} priority /></a>
      <label className="city-picker"><MapPin size={15} aria-hidden="true" /><span className="sr-only">Выберите город</span><select value={city} onChange={(event) => { setCity(event.target.value as City); setAddress(null); }}>{site.cities.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label>
      <nav className="desktop-navigation" aria-label="Основная навигация"><a href="#menu">Меню</a><a href="#companies">Компаниям</a><a href="#delivery">Доставка</a></nav>
      <button className="header-cart" onClick={() => setModal('cart')} aria-label={`Корзина, товаров: ${count}`}><ShoppingBag size={21} /><span>{count ? money(total) : 'Корзина'}</span>{count > 0 && <span className="cart-count">{count}</span>}</button>
      <button className="icon-button mobile-menu-button" onClick={() => setModal('navigation')} aria-label="Открыть меню"><Menu size={25} /></button>
    </div></header>

    <main>
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-image"><FoodImage src="/images/homestyle.webp" alt="Обед с курицей, картофельным пюре, супом и салатом" width={1280} height={853} eager desktopOnly sizes="(max-width: 1000px) 75vw, (max-width: 1320px) 65vw, 806px" /></div>
        <div className="hero-content"><span className="hero-kicker"><span /> Хороший день начинается с заботы</span><h1 id="hero-title"><span className="desktop-hero-title">Обед готов.<br />День свободен.</span><span className="mobile-hero-title">Что на обед?</span></h1><p>Готовые обеды в офис <span className="hero-price">450–550 ₽</span></p><a className="button button-primary hero-button" href="#menu">Выбрать обед <ArrowDown size={18} /></a><div className="hero-bottom"><Utensils size={16} /><span>Суп, горячее и салат в одном комплекте</span></div></div>
      </section>

      <section id="menu" className="menu-section container" aria-labelledby="menu-title">
        <div className="menu-toolbar"><div><span className="eyebrow desktop-only">ВКУСНО. ПОНЯТНО. КАЖДЫЙ ДЕНЬ.</span><h2 id="menu-title">Выберите свой обед</h2></div><button className="address-button" onClick={() => setModal('address')}><MapPin size={18} /><span>{address ? address.street : 'Укажите адрес доставки'}</span><ArrowRight size={17} /></button></div>
        <div className="date-toolbar"><div className="date-tabs" aria-label="День доставки">{cart.days.map((day) => <button type="button" key={day.value} className={`date-tab ${cart.date === day.value ? 'active' : ''}`} aria-pressed={cart.date === day.value} onClick={() => cart.setDate(day.value)} aria-label={day.full}><span>{day.short}</span><strong>{day.number}</strong></button>)}{!cart.ready && <span className="date-loading">Загружаем ближайшие дни…</span>}</div><button className="week-button" aria-label="На неделю" disabled={!cart.ready} onClick={() => setModal('week')}><CalendarDays size={19} /><span>На неделю</span><ArrowRight size={16} /></button><p className="menu-inclusion"><CheckIcon /> В каждом обеде 3 блюда</p></div>
        <p className="daily-menu-caption">Каждый день — новое меню{cart.ready && <> · {dailyMeals.length} обеда на выбор</>}</p>
        <div className={`meal-grid ${dailyMeals.length === 2 ? 'meal-grid--two' : ''}`}>{dailyMeals.map((entry, index) => <MealCard key={entry.id} wide={dailyMeals.length === 2} eager={index === 0} meal={entry} quantity={cart.items.find((item) => item.date === cart.date && item.mealId === entry.id)?.quantity ?? 0} onOpen={() => setProduct(entry.id)} onAdd={() => { if (cart.ready) add(entry.id); }} onRemove={() => cart.change({ mealId: entry.id, date: cart.date }, -1)} />)}</div>
        <div className="menu-bottom-note"><PackageCheck size={18} /><span>Один комплект — полноценный обед. Останется только сделать перерыв.</span></div>
        {cart.storageNotice && <p className="form-note" role="status">{cart.storageNotice}</p>}
        <WeeklyOffer disabled={!cart.ready} onChoose={() => setModal('week')} />
      </section>

      <section id="companies" className="corporate-section container" aria-labelledby="corporate-title"><div className="corporate-main"><span className="eyebrow">ВМЕСТЕ ВКУСНЕЕ</span><h2 id="corporate-title">Обеды для <br />вашей команды</h2><p>Когда обед организован, можно сосредоточиться на главном. Соберите заказ для всего офиса.</p><button className="button button-primary" onClick={() => setModal('business')}>Рассчитать для команды <ArrowRight size={18} /></button></div><div className="corporate-benefits"><div><Users size={25} strokeWidth={1.5} /><h3>Один общий заказ</h3><p>Каждый выбирает любимое, обеды приезжают по одному адресу.</p></div><div><CalendarDays size={25} strokeWidth={1.5} /><h3>План на рабочую неделю</h3><p>Выберите дни и комплекты заранее, без ежедневных обсуждений.</p></div><div><Heart size={25} strokeWidth={1.5} /><h3>Забота о команде</h3><p>Полноценный обед и время на спокойный перерыв.</p></div></div></section>

      <section id="delivery" className="delivery-section container" aria-labelledby="delivery-title"><div className="section-heading"><div><span className="eyebrow">ВСЁ ПРОСТО</span><h2 id="delivery-title">От выбора до обеда</h2></div><p>Три небольших шага.<br />И одна приятная пауза в вашем дне.</p></div><div className="steps"><article><span className="step-number">01</span><Utensils size={24} /><h3>Выберите обед</h3><p>Посмотрите состав и добавьте подходящий комплект. На один день или на несколько.</p></article><article><span className="step-number">02</span><MapPin size={24} /><h3>Укажите адрес</h3><p>Выберите город и удобный интервал. Итоговая сумма появится до подтверждения.</p></article><article><span className="step-number">03</span><Truck size={24} /><h3>Сделайте перерыв</h3><p>Обед уже выбран. Можно освободить время для себя и коллег.</p></article></div></section>

      <section className="faq-section container" aria-labelledby="faq-title"><div><span className="eyebrow">ПОЛЕЗНО ЗНАТЬ</span><h2 id="faq-title">Перед первым <br />заказом</h2><Leaf className="faq-leaf" size={55} strokeWidth={1} /></div><div className="faq-list"><details><summary>Что входит в обед?<ChevronDown size={18} /></summary><p>Суп, горячее с гарниром и салат. В карточке каждого обеда есть полный состав, вес порций и информация об аллергенах.</p></details><details><summary>Можно заказать на несколько дней?<ChevronDown size={18} /></summary><p>Да. Нажмите «На неделю», выберите комплект для каждого дня и пропустите дни, когда доставка не нужна. Все выбранные даты появятся в корзине.</p></details><details><summary>Где будет работать доставка?<ChevronDown size={18} /></summary><p>Города запуска — Ялта, Севастополь и Симферополь. Точные зоны и интервалы необходимо подтвердить перед запуском сервиса.</p></details><details><summary>Как узнать стоимость доставки?<ChevronDown size={18} /></summary><p>Она показывается при оформлении отдельно от стоимости еды. В этой демонстрационной версии используется пример: 100 ₽ за каждый день доставки.</p></details></div></section>
    </main>

    <footer className="site-footer"><div className="container footer-top"><a href="#" className="logo" aria-label="На главную"><Image src={site.logo} alt={site.name} width={175} height={62} /></a><p>Обед готов.<br /><strong>День свободен.</strong></p><nav aria-label="Навигация в подвале"><a href="#menu">Меню</a><a href="#companies">Компаниям</a><a href="#delivery">Доставка</a></nav><span className="footer-cities">Ялта<br />Севастополь<br />Симферополь</span></div><div className="container footer-bottom"><span>© Чайка Обеды</span><span>Демонстрационная версия · меню и условия для примера</span><span><Sparkles size={13} /> Сделано с заботой</span></div></footer>

    {count > 0 && !modal && !product && <button className="mobile-cart-bar" onClick={() => setModal('cart')}><ShoppingBag size={22} /><span>Корзина <small>{count} шт.</small></span><strong>{money(total)}</strong><ArrowRight size={20} /></button>}
    <div className={`toast ${toast ? 'toast-visible' : ''}`} role="status"><PackageCheck size={19} />{toast}</div>

    {meal && <ProductDialog meal={meal} date={cart.date} onClose={close} onAdd={(quantity) => { add(meal.id, quantity); close(); }} />}
    {modal === 'address' && <AddressDialog city={city} address={address} onClose={close} onSave={(value) => { setAddress(value); setCity(value.city as City); close(); }} />}
    {modal === 'week' && <WeekDialog days={cart.days} onClose={close} onAdd={(selection) => { cart.addWeek(selection); setModal('cart'); }} />}
    {modal === 'cart' && <CartDialog items={cart.items} city={city} address={address} onChange={cart.change} onRemove={cart.remove} onClose={close} onCheckout={() => setModal('checkout')} />}
    {modal === 'checkout' && <CheckoutDialog items={cart.items} city={city} address={address} onClose={close} onBack={() => setModal('cart')} onConfirm={(value) => { setOrder(value); setCity(value.address.city as City); setAddress(value.address); cart.clear(); setModal('confirmation'); }} />}
    {modal === 'confirmation' && order && <ConfirmationDialog order={order} onClose={close} />}
    {modal === 'business' && <BusinessDialog city={city} onClose={close} />}
    {modal === 'navigation' && <Dialog title="Чайка Обеды" onClose={close}><nav className="mobile-navigation" aria-label="Мобильная навигация">{[['#menu', 'Меню'], ['#companies', 'Компаниям'], ['#delivery', 'Доставка']].map(([href, label]) => <a key={href} href={href} onClick={close}>{label}<ArrowRight size={20} /></a>)}<button onClick={() => setModal('cart')}>Корзина <span>{money(total)}</span></button></nav></Dialog>}
  </>;
}

function CheckIcon() { return <Clock3 size={16} strokeWidth={1.7} />; }
