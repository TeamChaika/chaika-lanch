'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, Check, Copy, ExternalLink, ImagePlus, LockKeyhole, LogOut, Plus, Save, Trash2, Eye } from 'lucide-react';
import Link from 'next/link';
import type { Meal, MenuCatalog } from '@/data/menu';
import { money } from '@/data/menu';
import { FoodImage } from '../FoodImage';
import { MealCard } from '../MealCard';
import { Dialog } from '../Dialog';
import { NutritionEditor } from './NutritionEditor';

const days = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
const photos = ['029', '007', '003', '019', '016'].map((number) => `/images/lunch-photo-${number}.webp`);
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api/admin/${path}`, { cache: 'no-store', ...init }); }
  catch { throw new ApiError('Нет связи с сервером. Правки остались в этой вкладке. Проверьте подключение.', 0); }
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError('Сервер временно недоступен. Правки остались в этой вкладке. Попробуйте позже.', response.status); }
  if (!response.ok) throw new ApiError(data.error || 'Не удалось выполнить действие', response.status);
  return data;
}
const jsonRequest = (method: string, body: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function Admin() {
  const [phase, setPhase] = useState<'loading' | 'login' | 'editor'>('loading');
  const [saved, setSaved] = useState<MenuCatalog | null>(null);
  const [draft, setDraft] = useState<MenuCatalog | null>(null);
  const [week, setWeek] = useState(1);
  const [day, setDay] = useState(1);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [copyTarget, setCopyTarget] = useState('1-2');
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  async function load() {
    const value = await api<MenuCatalog>('menu');
    setSaved(value); setDraft(value); setPhase('editor');
  }
  useEffect(() => {
    let active = true;
    api<MenuCatalog>('menu').then((value) => { if (active) { setSaved(value); setDraft(value); setPhase('editor'); } }).catch((err) => {
      if (active) { setPhase('login'); if (!(err instanceof ApiError && err.status === 401)) setError('Админка пока недоступна. Проверьте подключение и попробуйте войти снова.'); }
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function report(err: unknown) {
    setError(err instanceof Error ? err.message : 'Не удалось выполнить действие');
    if (err instanceof ApiError && err.status === 401) setPhase('login');
  }
  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    setBusy(true); setError('');
    try {
      await api('session', jsonRequest('POST', { password: String(new FormData(form).get('password')) }));
      form.reset();
      // Keep unsaved edits after a session expires; publication still checks the revision.
      if (draft) setPhase('editor'); else await load();
    } catch (err) { report(err); } finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true); setError(''); setNotice('');
    try { const value = await api<MenuCatalog>('menu', jsonRequest('PUT', draft)); setSaved(value); setDraft(value); setNotice('Меню опубликовано. Посетители увидят его при открытии или обновлении сайта.'); }
    catch (err) { report(err); } finally { setBusy(false); }
  }
  async function reload() {
    if (dirty && !window.confirm('Загрузить опубликованное меню? Несохранённые правки будут отменены.')) return;
    setBusy(true); setError('');
    try { await load(); setNotice('Загружена актуальная версия меню'); } catch (err) { report(err); } finally { setBusy(false); }
  }
  async function signOut() {
    if (dirty && !window.confirm('Выйти без публикации правок?')) return;
    setBusy(true); setError('');
    try { await api('session', { method: 'DELETE' }); setPhase('login'); setSaved(null); setDraft(null); setNotice(''); } catch (err) { report(err); } finally { setBusy(false); }
  }
  function editMeal(id: string, patch: Partial<Meal>) {
    setDraft((current) => current && ({ ...current, meals: current.meals.map((meal) => meal.id === id ? { ...meal, ...patch } : meal) })); setNotice('');
  }
  function addMeal() {
    const meal: Meal = { id: crypto.randomUUID(), name: 'Новый комплекс', description: '', price: 550, image: photos[0], imageIsExample: true, enabled: true, tag: `Неделя ${week} · ${days[day - 1]}`, week, weekday: day,
      dishes: [{ category: 'Салат', name: '', weight: 100 }, { category: 'Суп', name: '', weight: 250 }, { category: 'Горячее', name: '', weight: 300 }, { category: 'Напиток', name: '', weight: 200 }] };
    setDraft((current) => current && ({ ...current, meals: [...current.meals, meal] })); setNotice('');
  }
  function copyDay() {
    const [targetWeek, targetDay] = copyTarget.split('-').map(Number);
    if (week === targetWeek && day === targetDay) { setError('Выберите другой день для копирования'); return; }
    if (!window.confirm(`Заменить меню: неделя ${targetWeek}, ${days[targetDay - 1].toLowerCase()}? Изменения появятся на сайте после публикации.`)) return;
    setDraft((current) => {
      if (!current) return current;
      const copies = current.meals.filter((meal) => meal.week === week && meal.weekday === day).map((meal) => ({ ...structuredClone(meal), id: crypto.randomUUID(), week: targetWeek, weekday: targetDay, tag: `Неделя ${targetWeek} · ${days[targetDay - 1]}` }));
      const closed = current.closedDays.filter((value) => value !== copyTarget);
      if (current.closedDays.includes(`${week}-${day}`)) closed.push(copyTarget);
      return { ...current, closedDays: closed, meals: [...current.meals.filter((meal) => meal.week !== targetWeek || meal.weekday !== targetDay), ...copies] };
    });
    setError(''); setNotice('День скопирован. Опубликуйте меню, когда закончите правки.');
  }
  async function upload(id: string, file?: File) {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) { setError('Фото должно быть не больше 12 МБ'); return; }
    setUploading(id); setError(''); setNotice('');
    try {
      const result = await api<Pick<Meal, 'image' | 'imageVariants'> & { optimizedBytes: number }>('images', { method: 'POST', headers: { 'Content-Type': file.type }, body: file });
      editMeal(id, { image: result.image, imageVariants: result.imageVariants, imageIsExample: false });
      setNotice(`Фото готово: WebP, ${Math.round(result.optimizedBytes / 1024)} КБ. Чтобы показать его посетителям, опубликуйте меню.`);
    } catch (err) { report(err); } finally { setUploading(null); }
  }
  async function passwordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    if (data.get('newPassword') !== data.get('repeatPassword')) { setError('Новые пароли не совпадают'); return; }
    setBusy(true); setError('');
    try { await api('password', jsonRequest('PUT', { currentPassword: data.get('currentPassword'), newPassword: data.get('newPassword') })); form.reset(); setPasswordOpen(false); setNotice('Пароль изменён. На других устройствах потребуется войти заново.'); }
    catch (err) { report(err); } finally { setBusy(false); }
  }

  if (phase === 'loading') return <main className="admin-loading" role="status">Загружаем админку…</main>;
  if (phase === 'login') return <main className="admin-login"><Link href="/" className="admin-back"><ArrowLeft size={18} /> На сайт</Link><form onSubmit={signIn} className="admin-login-card"><span className="admin-lock"><LockKeyhole size={28} /></span><p className="eyebrow">ЧАЙКА ОБЕДЫ · ДЛЯ КОМАНДЫ</p><h1>Всё меню —<br />в ваших руках.</h1><p className="muted">Войдите по паролю владельца, чтобы изменить дни, блюда и фотографии.</p><label className="field">Пароль владельца<input name="password" type="password" autoComplete="current-password" required maxLength={128} autoFocus /></label>{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-primary full-width" disabled={busy}>{busy ? 'Входим…' : 'Войти в админку'}</button></form></main>;
  if (!draft) return null;
  const todayMeals = draft.meals.filter((meal) => meal.week === week && meal.weekday === day);
  const closed = draft.closedDays.includes(`${week}-${day}`);
  const locked = busy || !!uploading;

  return <div className="admin-app">
    <header className="admin-header"><div className="admin-brand"><CalendarDays size={26} /><div><strong>Чайка Обеды</strong><span>Управление меню</span></div></div><div className="admin-header-actions"><Link href="/admin/orders" className="admin-text-button">Заказы</Link><a href="/" target="_blank" rel="noreferrer" className="admin-text-button"><ExternalLink size={17} /> Сайт</a><button className="admin-text-button" onClick={() => { setError(''); setPasswordOpen(true); }} disabled={locked}><LockKeyhole size={17} /> Пароль</button><button className="admin-text-button" onClick={signOut} disabled={locked}><LogOut size={17} /> Выйти</button></div></header>
    <main className="admin-main">
      <div className="admin-intro"><div><p className="eyebrow">МЕНЮ НА ЧЕТЫРЕ НЕДЕЛИ</p><h1>Что будем готовить?</h1><p>Выберите день, обновите обеды и опубликуйте изменения.</p></div><div className="admin-published"><span className={`admin-status-dot ${dirty ? 'unsaved' : ''}`} />{dirty ? 'Есть неопубликованные правки' : draft.updatedAt ? `Опубликовано ${new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Simferopol' }).format(new Date(draft.updatedAt))}` : 'Исходное меню с сайта'}</div></div>
      <div className="admin-messages" aria-live="polite">{error && <div className="admin-error" role="alert">{error}{error.includes('другой вкладке') && <button onClick={reload} disabled={locked}>Загрузить актуальное меню</button>}</div>}{notice && <div className="admin-notice"><Check size={18} />{notice}</div>}</div>
      <fieldset disabled={locked} className="admin-editing">
        <section className="admin-cycle"><label className="field">Начало первой недели<input type="date" value={draft.cycleStartsOn} onChange={(event) => setDraft({ ...draft, cycleStartsOn: event.target.value })} required /></label><p>Выберите понедельник. После четвёртой недели меню повторяется с первой. Скрытые дни не принимают новые заказы.</p><button type="button" className="admin-text-button" onClick={reload}>Отменить правки / обновить</button></section>
        <div className="admin-week-tabs" role="group" aria-label="Неделя для редактирования">{[1, 2, 3, 4].map((value) => <button type="button" key={value} aria-pressed={week === value} className={week === value ? 'selected' : ''} onClick={() => setWeek(value)}><span>Неделя {value}</span><small>{draft.meals.filter((meal) => meal.week === value && meal.enabled !== false && !draft.closedDays.includes(`${value}-${meal.weekday}`)).length} комплексов</small></button>)}</div>
        <div className="admin-workspace"><nav className="admin-days" aria-label="День для редактирования">{days.map((label, index) => {
          const count = draft.meals.filter((meal) => meal.week === week && meal.weekday === index + 1 && meal.enabled !== false).length;
          const hidden = draft.closedDays.includes(`${week}-${index + 1}`);
          return <button key={label} type="button" aria-pressed={day === index + 1} className={day === index + 1 ? 'selected' : ''} onClick={() => setDay(index + 1)}><span>{label}</span><small>{hidden ? 'День скрыт' : count ? `${count} ${count === 1 ? 'комплекс' : 'комплекса'}` : 'Меню не заполнено'}</small></button>;
        })}</nav>
        <div className="admin-day-content"><div className="admin-day-heading"><div><p className="eyebrow">НЕДЕЛЯ {week}</p><h2>{days[day - 1]}</h2></div><button type="button" className="admin-text-button" onClick={() => setPreview(true)}><Eye size={18} /> Предпросмотр</button></div>
          <div className="admin-day-tools"><label className="admin-checkbox"><input type="checkbox" checked={!closed} onChange={(event) => setDraft({ ...draft, closedDays: event.target.checked ? draft.closedDays.filter((value) => value !== `${week}-${day}`) : [...draft.closedDays, `${week}-${day}`] })} /><span>День доступен для заказа</span></label><div className="admin-copy"><label className="sr-only" htmlFor="copy-target">Куда скопировать день</label><select id="copy-target" value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}>{[1, 2, 3, 4].flatMap((w) => days.map((label, index) => <option key={`${w}-${index + 1}`} value={`${w}-${index + 1}`}>Нед. {w} · {label}</option>))}</select><button className="admin-icon-button" type="button" title="Скопировать меню дня" aria-label="Скопировать меню дня" onClick={copyDay}><Copy size={18} /></button></div></div>
          {closed && <div className="admin-day-hidden">День скрыт на сайте. Можно подготовить меню и включить его позже.</div>}
          {todayMeals.map((meal, index) => <article className="admin-meal" key={meal.id}>
            <div className="admin-meal-heading"><span>КОМПЛЕКС {index + 1}</span><label className="admin-checkbox"><input type="checkbox" checked={meal.enabled !== false} onChange={(event) => editMeal(meal.id, { enabled: event.target.checked })} />Показывать</label><button type="button" className="admin-icon-button danger" aria-label={`Удалить комплекс ${meal.name}`} onClick={() => { if (window.confirm(`Удалить комплекс «${meal.name}»?`)) setDraft({ ...draft, meals: draft.meals.filter((value) => value.id !== meal.id) }); }}><Trash2 size={18} /></button></div>
            <div className="admin-meal-top"><div className="admin-photo-editor"><FoodImage key={meal.image} src={meal.image} variants={meal.imageVariants} alt={`Фото: ${meal.name}`} width={640} height={427} sizes="(max-width: 700px) 90vw, 300px" /><label className="admin-upload"><ImagePlus size={18} />{uploading === meal.id ? 'Готовим WebP…' : 'Загрузить фото'}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Загрузить фото: ${meal.name}`} onChange={(event) => { void upload(meal.id, event.target.files?.[0]); event.target.value = ''; }} /></label><small>JPG, PNG, WebP до 12 МБ. Сожмём автоматически.</small><details className="admin-library"><summary>Выбрать готовое фото</summary><div>{photos.map((photo, photoIndex) => <button type="button" key={photo} onClick={() => editMeal(meal.id, { image: photo, imageVariants: undefined, imageIsExample: true })} aria-label={`Пример подачи ${photoIndex + 1}`}><FoodImage src={photo} alt="" width={160} height={107} sizes="80px" /></button>)}</div></details><label className="admin-checkbox"><input type="checkbox" checked={meal.imageIsExample !== false} onChange={(event) => editMeal(meal.id, { imageIsExample: event.target.checked })} />Фото — пример подачи</label></div>
              <div className="admin-meal-fields"><label className="field">Название комплекса<input value={meal.name} maxLength={160} onChange={(event) => editMeal(meal.id, { name: event.target.value })} required /></label><div className="admin-field-row"><label className="field">Цена, ₽<input type="number" min={1} max={100000} value={meal.price} onChange={(event) => editMeal(meal.id, { price: Number(event.target.value) })} required /></label><label className="field">Подпись на фото<input value={meal.tag} maxLength={80} onChange={(event) => editMeal(meal.id, { tag: event.target.value })} /></label></div><label className="field">Описание<textarea value={meal.description} maxLength={1000} rows={3} onChange={(event) => editMeal(meal.id, { description: event.target.value })} /></label><div className="admin-field-row"><label className="field">Неделя<select value={meal.week} onChange={(event) => editMeal(meal.id, { week: Number(event.target.value) })}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>Неделя {value}</option>)}</select></label><label className="field">День<select value={meal.weekday} onChange={(event) => editMeal(meal.id, { weekday: Number(event.target.value) })}>{days.map((label, index) => <option value={index + 1} key={label}>{label}</option>)}</select></label></div></div>
            </div>
            <NutritionEditor value={meal.nutrition} onChange={nutrition => editMeal(meal.id, { nutrition })} />
            <div className="admin-dishes-heading"><h3>Что входит в обед</h3><span>{meal.dishes.reduce((sum, dish) => sum + dish.weight, 0)} г · {money(meal.price)}</span></div>
            <div className="admin-dishes">{meal.dishes.map((dish, dishIndex) => <div className="admin-dish" key={dishIndex}><label className="field">Категория<input aria-label={`Категория позиции ${dishIndex + 1}`} value={dish.category} maxLength={50} onChange={(event) => editMeal(meal.id, { dishes: meal.dishes.map((value, i) => i === dishIndex ? { ...value, category: event.target.value } : value) })} required /></label><label className="field">Блюдо<textarea rows={2} aria-label={`Название позиции ${dishIndex + 1}`} value={dish.name} maxLength={300} placeholder="Название блюда" onChange={(event) => editMeal(meal.id, { dishes: meal.dishes.map((value, i) => i === dishIndex ? { ...value, name: event.target.value } : value) })} required /></label><label className="field">Вес, г<input aria-label={`Вес позиции ${dishIndex + 1}`} type="number" min={1} max={10000} value={dish.weight} onChange={(event) => editMeal(meal.id, { dishes: meal.dishes.map((value, i) => i === dishIndex ? { ...value, weight: Number(event.target.value) } : value) })} required /></label><button type="button" className="admin-icon-button danger" aria-label={`Удалить позицию ${dishIndex + 1}`} disabled={meal.dishes.length <= 1} onClick={() => editMeal(meal.id, { dishes: meal.dishes.filter((_, i) => i !== dishIndex) })}><Trash2 size={17} /></button></div>)}</div>
            <button type="button" className="admin-text-button" disabled={meal.dishes.length >= 12} onClick={() => editMeal(meal.id, { dishes: [...meal.dishes, { category: 'Другое', name: '', weight: 100 }] })}><Plus size={18} /> Добавить позицию</button>
          </article>)}
          <button type="button" className="admin-add-meal" onClick={addMeal}><Plus size={20} /> Добавить комплекс на этот день</button>
        </div></div>
      </fieldset>
    </main>
    <footer className="admin-save-bar"><div><strong>{dirty ? 'Правки ещё не на сайте' : 'Меню сохранено'}</strong><span>{uploading ? 'Обрабатываем фотографию…' : 'Публикация обновляет всё меню сразу'}</span></div><button type="button" className="button button-primary" onClick={publish} disabled={!dirty || locked}><Save size={18} />{busy ? 'Сохраняем…' : 'Опубликовать меню'}</button></footer>
    {preview && <Dialog title={`${days[day - 1]} · предпросмотр`} onClose={() => setPreview(false)}><div className="admin-preview">{closed || !todayMeals.some((meal) => meal.enabled !== false) ? <p>На этот день обедов пока нет.</p> : todayMeals.filter((meal) => meal.enabled !== false).map((meal) => <MealCard key={meal.id} meal={meal} quantity={0} onOpen={() => {}} onAdd={() => {}} onRemove={() => {}} />)}<p className="form-note">Это предпросмотр. Кнопки заказа здесь не добавляют обеды в корзину.</p></div></Dialog>}
    {passwordOpen && <Dialog title="Сменить пароль" onClose={() => { if (!busy) setPasswordOpen(false); }}><form onSubmit={passwordSubmit} className="dialog-content"><p className="muted">После смены пароля остальные устройства выйдут из админки.</p><label className="field">Текущий пароль<input name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required /></label><label className="field">Новый пароль<input name="newPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><label className="field">Повторите новый пароль<input name="repeatPassword" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label><p className="form-note">Минимум 12 символов. Можно использовать длинную фразу.</p>{error && <p className="error-message" role="alert">{error}</p>}<button className="button button-primary full-width" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить новый пароль'}</button></form></Dialog>}
  </div>;
}
