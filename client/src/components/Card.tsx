import type { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
}

/** A raised surface used for grouping content on every screen. */
export function Card({ children, className = '' }: CardProps) {
  return (
    <div className={`rounded-2xl border border-border-subtle bg-surface-raised ${className}`}>
      {children}
    </div>
  );
}
