import { type ReactNode, useEffect } from 'react';

export default function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in p-4">
      <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative panel-elevated flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden animate-fade-in-up">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-200/80 px-6 py-5 dark:border-zinc-800">
          <h2 className="section-title">{title}</h2>
          <button type="button" onClick={onClose} className="btn-icon text-lg leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
