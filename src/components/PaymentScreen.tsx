'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, RefreshCw } from 'lucide-react';
import { money } from '@/data/menu';
import { formatDate, itemKey, type CartItem } from '@/lib/order';
import type { PaymentState, PaymentView } from '@/lib/payments';

const sandboxLabels: Record<PaymentState, [string, string]> = {
  creating: ['Создаём тестовый платёж', 'Подождите, пока QR Manager подготовит платёжную ссылку.'],
  pending: ['Тестовая оплата через СБП', 'QR Manager автоматически подтвердит тестовый платёж. Открывать приложение банка не обязательно.'],
  paid: ['Тестовая оплата подтверждена', 'QR Manager подтвердил платёж. Деньги не списывались, заказ на кухню не отправлен.'],
  cancelled: ['Тестовый платёж отменён', 'QR Manager отменил операцию. Корзина сохранена, можно вернуться к оформлению.'],
  expired: ['Срок тестового платежа истёк', 'Корзина сохранена. Вернитесь к оформлению, чтобы создать новую попытку.'],
  failed: ['Тестовый сервис временно недоступен', 'QR Manager отклонил создание платежа. QR-код не получен, корзина сохранена. Попробуйте позже.'],
  unknown: ['Результат создания пока неизвестен', 'Ответ QR Manager не получен полностью. Эта попытка не будет отправлена повторно. Оплата не подтверждена.'],
};
const liveLabels: Record<PaymentState, [string, string]> = {
  creating: ['Создаём платёж', 'Подождите, пока подготовится QR-код.'],
  pending: ['Ожидаем оплату', 'Отсканируйте QR-код или откройте оплату на телефоне. Подтверждение появится автоматически.'],
  paid: ['Заказ оплачен', 'Оплата подтверждена. Заказ сохранён и доступен нашей команде.'],
  cancelled: ['Платёж отменён', 'Корзина сохранена. Если деньги списались, проверьте статус перед новой оплатой.'],
  expired: ['Срок платежа истёк', 'Корзина сохранена. Если деньги списались, проверьте статус перед новой оплатой.'],
  failed: ['Не удалось создать платёж', 'QR Manager отклонил создание платежа. Корзина сохранена. Попробуйте позже.'],
  unknown: ['Проверяем результат', 'Ответ платёжного сервиса задерживается. Не оплачивайте повторно — проверка продолжится автоматически.'],
};
export function PaymentScreen({ id }: { id: string }) {
  const [payment, setPayment] = useState<PaymentView | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const alive = useRef(true);
  const socketConnected = useRef(false);
  const check = useCallback(async (refresh = true) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(id)}${refresh ? '?refresh=1' : ''}`, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(20000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось проверить платёж.');
      if (alive.current) { setPayment((current) => current?.state === 'paid' && data.state !== 'paid' ? current : data); setError(''); }
    } catch (err) { if (alive.current) setError(err instanceof Error ? err.message : 'Не удалось проверить платёж.'); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }, [id]);
  useEffect(() => {
    alive.current = true;
    const timer = window.setTimeout(() => void check(false), 0);
    return () => { alive.current = false; window.clearTimeout(timer); };
  }, [check]);
  const terminal = !!payment && ['paid', 'failed'].includes(payment.state);
  useEffect(() => {
    if (terminal) return;
    let closed = false;
    let socket: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout>;
    let failures = 0;
    function connect() {
      if (closed) return;
      socket = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/payments/ws?id=${encodeURIComponent(id)}`);
      socket.onopen = () => { socketConnected.current = true; failures = 0; };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'payment' && message.payment?.id === id && message.payment.state in liveLabels) {
            setPayment((current) => current?.state === 'paid' && message.payment.state !== 'paid' ? current : message.payment); setError('');
          } else if (message.type === 'unavailable') void check();
        } catch { void check(); }
      };
      socket.onerror = () => socket?.close();
      socket.onclose = () => {
        socketConnected.current = false;
        if (!closed) retry = setTimeout(connect, Math.min(30000, 2000 * 2 ** Math.min(failures++, 4)));
      };
    }
    connect();
    const poll = () => { if (document.visibilityState === 'visible') void check(); };
    // GET also works when the browser or proxy cannot keep a WebSocket connection.
    const timer = window.setInterval(() => { if (!socketConnected.current) poll(); }, 5500);
    document.addEventListener('visibilitychange', poll);
    return () => { closed = true; clearTimeout(retry); socket?.close(); socketConnected.current = false; clearInterval(timer); document.removeEventListener('visibilitychange', poll); };
  }, [id, terminal, check]);
  useEffect(() => {
    if (payment?.state !== 'paid') return;
    // Remove only the paid quantities, preserving other meals added in another tab.
    try {
      const marker = `chaika-paid-${id}`;
      if (localStorage.getItem(marker)) return;
      const current: CartItem[] = JSON.parse(localStorage.getItem('chaika-lunch-cart-v1') || '[]');
      const paid = new Map(payment.items.map((item) => [itemKey(item), item.quantity]));
      localStorage.setItem('chaika-lunch-cart-v1', JSON.stringify(current.map((item) => ({ ...item, quantity: Math.max(0, item.quantity - (paid.get(itemKey(item)) || 0)) })).filter((item) => item.quantity > 0)));
      localStorage.setItem(marker, '1');
    } catch { /* Storage can be blocked; the confirmed server status is unaffected. */ }
  }, [payment, id]);
  const state = payment?.state;
  const sandbox = payment?.mode === 'sandbox';
  const labels = sandbox ? sandboxLabels : liveLabels;
  function back() {
    if (state && ['paid', 'failed', 'cancelled', 'expired'].includes(state)) {
      try { sessionStorage.removeItem('chaika-payment-attempt'); } catch { /* Optional browser cache. */ }
    }
  }
  return <main className="payment-page">
    {/* Full navigation reloads the saved cart and closes any cached checkout dialog. */}
    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
    <a className="payment-back" href="/#menu" onClick={back}><ArrowLeft size={18} /> В меню</a>
    <section className="payment-card" aria-labelledby="payment-title">
      <div className="payment-test-badge">{sandbox ? 'QR MANAGER · ТЕСТОВАЯ СРЕДА' : 'ЧАЙКА ОБЕДЫ · СБП'}</div>
      <div className={`payment-symbol ${state === 'paid' ? 'payment-symbol--success' : ''}`}>{state === 'paid' ? <CheckCircle2 size={44} /> : <CircleAlert size={40} />}</div>
      <h1 id="payment-title">{state ? labels[state][0] : 'Проверяем платёж'}</h1>
      <p className="muted" role="status">{state ? labels[state][1] : 'Получаем сохранённые данные заказа.'}</p>
      {sandbox && <p className="demo-notice">Без списания денег и реальной доставки.</p>}
      {state === 'pending' && payment?.qrImage && <div className="payment-qr">
        {/* QR is generated on the server; no third-party image request or personal data. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={payment.qrImage} width={320} height={320} alt={sandbox ? 'QR-код тестового платежа СБП' : 'QR-код оплаты СБП'} />
        {payment.paymentUrl && <a className="button button-primary full-width" href={payment.paymentUrl} target="_blank" rel="noopener noreferrer">{sandbox ? 'Открыть тестовую оплату' : 'Оплатить через СБП'}</a>}
      </div>}
      {payment && <div className="payment-summary">
        <p className="form-note">{sandbox ? 'Тестовый заказ' : 'Заказ'} · {payment.id.slice(0, 8)}{payment.number ? ` · QRM № ${payment.number}` : ''}</p>
        {payment.items.map((item) => <div className="summary-row" key={itemKey(item)}><span>{item.name} × {item.quantity}<small>{formatDate(item.date)}</small></span><span>{money(item.price * item.quantity)}</span></div>)}
        {payment.gift && <div className="summary-row"><span>Выпечка в подарок · 1 шт.</span><span>0 ₽</span></div>}
        <div className="summary-row"><span>Доставка</span><span>{money(payment.delivery)}</span></div>
        <div className="total-row"><span>{sandbox ? 'Сумма теста' : 'Итого'}</span><strong>{money(payment.total)}</strong></div>
      </div>}
      {state === 'paid' && !sandbox && <p className="soft-note">{payment?.fulfillment === 'completed' ? 'Заказ выполнен' : payment?.fulfillment === 'accepted' ? 'Заказ принят в работу' : 'Ожидает принятия командой'}</p>}
      {error && <p className="error-message" role="alert">{error}</p>}
      {(!state || ['pending', 'creating', 'unknown', 'cancelled', 'expired'].includes(state)) && <button className="button button-secondary full-width" disabled={busy} onClick={() => void check()}><RefreshCw size={18} />{busy ? 'Проверяем…' : 'Проверить статус'}</button>}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a className="button button-primary full-width payment-return" href="/#menu" onClick={back}>Вернуться в меню</a>
    </section>
  </main>;
}
