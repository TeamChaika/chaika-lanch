'use client';

import { useEffect, useId, useRef } from 'react';
import { ArrowLeft, X } from 'lucide-react';

export function Dialog({ title, children, onClose, onBack, wide = false }: { title: string; children: React.ReactNode; onClose: () => void; onBack?: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);

  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} aria-labelledby={titleId} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-inner">
      <header className="dialog-header">
        {onBack && <button type="button" className="icon-button" aria-label="Назад" onClick={onBack}><ArrowLeft /></button>}
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Закрыть" onClick={onClose}><X /></button>
      </header>
      {children}
    </div>
  </dialog>;
}
