import type { ReactNode } from 'react';
import { Card } from './Card';

interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: ReactNode;
}

/** A single metric tile used on the dashboard. */
export function StatCard({ label, value, unit, icon }: StatCardProps) {
  return (
    <Card className="flex flex-col justify-between p-4">
      <div className="flex items-center gap-2 text-ink-faint">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-bold text-ink tabular-nums">
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-ink-faint">{unit}</span> : null}
      </p>
    </Card>
  );
}
