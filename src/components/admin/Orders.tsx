'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { money } from '@/data/menu';
import { formatDate } from '@/lib/order';
import type { OwnerOrder, PaymentMode, PaymentState } from '@/lib/payments';

const labels: Record<PaymentState, string> = { creating: 'Создаётся', pending: 'Ожидает оплаты', paid: 'Оплачен', cancelled: 'Отменён', expired: 'Истёк', failed: 'Ошибка создания', unknown: 'Требует проверки' };
type Batch = { orders: OwnerOrder[]; cursor?: string };
export function Orders() {
  const [day, setDay] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Simferopol' }).format(new Date()));
  const [mode, setMode] = useState<PaymentMode>('live');
  const [batch, setBatch] = useState<Batch>({ orders: [] });
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [updated, setUpdated] = useState('');
  const generation = useRef(0);
  const working = useRef(false);
  const load = useCallback(async (cursor?: string) => {
    const version = ++generation.current;
    working.current = true; setBusy(true);
    try {
      const params = new URLSearchParams({ day, mode, ...(cursor ? { cursor } : {}) });
      const response = await fetch(`/api/admin/orders?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (version !== generation.current) return;
      if (response.status === 401) { setLogin(true); setBatch({ orders: [] }); return; }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось загрузить заказы.');
      setLogin(false); setError('');
      setBatch((previous) => ({ orders: cursor ? [...previous.orders, ...data.orders].filter((order, index, all) => all.findIndex((item) => item.id === order.id) === index) : data.orders, cursor: data.cursor }));
      setUpdated(new Date().toLocaleTimeString('ru-RU'));
    } catch (err) { if (version === generation.current) setError(err instanceof Error ? err.message : 'Нет связи с сервером.'); }
    finally { if (version === generation.current) { working.current = false; setBusy(false); } }
  }, [day, mode]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => { if (!working.current && document.visibilityState === 'visible') void load(); }, 30000);
    // This counter cancels stale requests, not a DOM ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { generation.current++; clearTimeout(initial); clearInterval(timer); };
  }, [load]);
  async function action(order: OwnerOrder, action: 'refresh' | 'accepted' | 'completed') {
    working.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/orders/${order.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: order.mode, action }), signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось обновить заказ.');
      setBatch((previous) => ({ ...previous, orders: previous.orders.map((value) => value.id === data.id ? { ...value, ...data } : value) }));
    } catch (err) { setError(err instanceof Error ? err.message : 'Нет связи с сервером.'); }
    finally { working.current = false; setBusy(false); }
  }
  return <main className="admin-shell">
    <header className="admin-header"><div className="admin-brand"><div><strong>Чайка Обеды</strong><span>Заказы и оплата</span></div></div><Link href="/admin" className="admin-text-button">Управление меню</Link></header>
    <section className="orders-panel">
      <h1>Заказы</h1>
      <div className="orders-filters"><label className="field">Дата оформления<input type="date" value={day} onChange={(event) => { if (event.target.value) setDay(event.target.value); }} /></label><label className="field">Среда<select value={mode} onChange={(event) => setMode(event.target.value as PaymentMode)}><option value="live">Боевые заказы</option><option value="sandbox">Тестовые заказы</option></select></label><button className="button button-secondary" disabled={busy} onClick={() => void load()}>Обновить</button></div>
      <p className="muted">Оплата подтверждается сервером QR Manager. Принятые заказы выполняются вашей командой.{updated && ` Обновлено: ${updated}.`}</p>
      {error && <p role="alert" className="error-message">{error}</p>}
      {login ? <p className="soft-note">Для просмотра заказов <Link href="/admin">войдите по паролю владельца</Link>, затем откройте «Заказы».</p> : <>
        {!batch.orders.length && <p className="soft-note">{busy ? 'Загружаем заказы…' : 'За выбранную дату заказов нет.'}</p>}
        <div className="orders-grid">{batch.orders.map((order) => <article className="owner-order" key={order.id}>
          <header><strong>№ {order.id.slice(0, 8)}</strong><span className={order.state === 'paid' ? 'order-paid' : ''}>{labels[order.state]}</span></header>
          <p className="muted">{new Date(order.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Simferopol' })} · {order.mode === 'live' ? 'СБП' : 'Тест'}</p>
          {order.customer && <div className="order-contact"><strong>{order.customer.name}</strong><a href={`tel:+${order.customer.phone}`}>+{order.customer.phone}</a><span>{order.customer.email}</span><span>{order.customer.address.city}, {order.customer.address.street}{order.customer.address.office && `, офис / кв. ${order.customer.address.office}`}{order.customer.address.floor && `, этаж ${order.customer.address.floor}`}</span><strong>Доставка: {order.customer.slot}</strong></div>}
          {order.items.map((item) => <p className="summary-row" key={`${item.date}-${item.mealId}`}><span>{item.name} × {item.quantity}<small>{formatDate(item.date)}</small></span><span>{money(item.price * item.quantity)}</span></p>)}
          {order.gift && <p>Выпечка в подарок · 1 шт.</p>}
          <p className="summary-row"><span>Доставка</span><span>{money(order.delivery)}</span></p><p className="total-row"><span>Итого</span><strong>{money(order.total)}</strong></p>
          {order.reviewReason && order.state !== 'paid' && <p className="error-message">{order.reviewReason}</p>}
          {order.verifiedAt && <p className="form-note">Проверено: {new Date(order.verifiedAt).toLocaleString('ru-RU')}</p>}
          <footer>{order.state !== 'paid' ? <button className="button button-secondary" disabled={busy} onClick={() => void action(order, 'refresh')}>Перепроверить оплату</button> : order.fulfillment === 'completed' ? <strong>Выполнен</strong> : <button className="button button-primary" disabled={busy} onClick={() => void action(order, order.fulfillment === 'accepted' ? 'completed' : 'accepted')}>{order.fulfillment === 'accepted' ? 'Отметить выполненным' : 'Принять в работу'}</button>}</footer>
        </article>)}</div>
        {batch.cursor && <button className="button button-secondary" disabled={busy} onClick={() => void load(batch.cursor)}>Показать ещё</button>}
      </>}
    </section>
  </main>;
}
