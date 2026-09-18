'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="container empty-state"><h1>Меню временно недоступно</h1><p>Не удалось загрузить актуальные обеды. Попробуйте ещё раз через минуту.</p><button className="button button-primary" onClick={reset}>Попробовать снова</button></main>;
}
