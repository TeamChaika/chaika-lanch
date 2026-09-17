import Image from 'next/image';
import { ArrowRight, Gift } from 'lucide-react';
import { site } from '@/data/site';
import { CartItem, weeklyGiftStatus } from '@/lib/order';

const gift = site.weeklyGift;

export function WeeklyOffer({ onChoose, disabled }: { onChoose: () => void; disabled: boolean }) {
  return (
    <section className="weekly-offer" aria-labelledby="weekly-offer-title">
      <div className="weekly-offer-copy">
        <span className="gift-kicker"><Gift size={17} aria-hidden="true" /> ПРИЯТНЫЙ БОНУС</span>
        <h2 id="weekly-offer-title">Обеды на неделю. <br />Выпечка в подарок.</h2>
        <p>Закажите обеды на {gift.requiredDays} рабочих дней одним заказом — добавим сладкий подарок за наш счёт.</p>
        <button className="button" disabled={disabled} onClick={onChoose}>Выбрать обеды на неделю <ArrowRight size={18} /></button>
        <small>Одна выпечка на заказ. На фото — пример подарка.</small>
      </div>
      <div className="weekly-offer-photo">
        <Image src={gift.image} alt={gift.imageAlt} width={900} height={600} sizes="(max-width: 700px) 90vw, 550px" />
        <span className="gift-stamp">С заботой<br /><strong>о вас</strong></span>
      </div>
    </section>
  );
}

export function WeeklyGiftCard({ items }: { items: readonly Pick<CartItem, 'date' | 'quantity'>[] }) {
  const { days, eligible } = weeklyGiftStatus(items);
  return (
    <div className={`gift-card ${eligible ? 'gift-card--earned' : ''}`}>
      <div className="gift-card-photo"><Image src={gift.image} alt={gift.imageAlt} width={135} height={108} /></div>
      <div className="gift-card-copy" role="status" aria-live="polite" aria-atomic="true">
        <span className="gift-kicker"><Gift size={14} aria-hidden="true" /> {eligible ? 'ВАШ ПОДАРОК' : 'БОНУС ЗА НЕДЕЛЮ'}</span>
        <h3>{gift.name}</h3>
        <p>{eligible ? `1 шт. на заказ за обеды на все ${gift.requiredDays} рабочих дней.` : `Выбрано дней: ${days} из ${gift.requiredDays}. Соберите полную неделю, чтобы получить подарок.`}</p>
        {eligible && <strong className="gift-price">0 ₽ <span>Добавлена автоматически</span></strong>}
      </div>
    </div>
  );
}

export function WeeklyGiftSummary({ items }: { items: readonly Pick<CartItem, 'date' | 'quantity'>[] }) {
  if (!weeklyGiftStatus(items).eligible) return null;
  return <div className="summary-row gift-summary"><span><Gift size={15} aria-hidden="true" /> {gift.name} · 1 шт.</span><strong>0 ₽</strong></div>;
}
