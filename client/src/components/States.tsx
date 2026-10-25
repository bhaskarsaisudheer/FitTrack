import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';

interface LoadingProps {
  label?: string;
}

interface EmptyProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

interface ErrorProps {
  message: string;
  onRetry?: () => void;
}

export function LoadingState({ label = 'Loading…' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-ink-faint">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

/** Shown when a list has no items yet. */
export function EmptyState({ title, description, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="rounded-2xl bg-surface-hover p-4">
        <Inbox className="h-6 w-6 text-ink-faint" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description ? <p className="max-w-xs text-sm text-ink-muted">{description}</p> : null}
      {action}
    </div>
  );
}

/** Shown when a request fails. */
export function ErrorState({ message, onRetry }: ErrorProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
    >
      <div className="rounded-2xl bg-danger/10 p-4">
        <AlertCircle className="h-6 w-6 text-danger" aria-hidden="true" />
      </div>
      <h3 className="text-base font-semibold text-ink">Something went wrong</h3>
      <p className="max-w-xs text-sm text-ink-muted">{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
