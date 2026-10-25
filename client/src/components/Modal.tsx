import { X } from 'lucide-react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** How wide the sheet is on larger screens. */
  size?: 'md' | 'lg';
}

/** A bottom-sheet style dialog that works well on a phone. */
export function Modal({ open, title, onClose, children, footer, size = 'md' }: ModalProps) {
  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent the page behind the sheet from scrolling.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-border-subtle bg-surface-raised sm:rounded-3xl ${
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-md'
        }`}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-border-subtle bg-surface-raised px-5 py-4">
          <h2 className="text-base font-bold text-ink">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer ? (
          <div className="sticky bottom-0 border-t border-border-subtle bg-surface-raised px-5 py-4 safe-bottom">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
