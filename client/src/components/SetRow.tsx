import { Check, Trash2 } from 'lucide-react';
import type { DraftSet } from '../types';

interface SetRowProps {
  set: DraftSet;
  /** Values from the previous session, shown as a hint. */
  previous?: { weight_kg: number; reps: number } | null;
  /** True when the weight is entered per dumbbell. */
  isDumbbell?: boolean;
  onChange: (clientId: string, changes: Partial<DraftSet>) => void;
  /**
   * Called with the values that should be written to the server. The values
   * are passed in explicitly so the caller never has to read a stale copy
   * of the draft state.
   */
  onCommit?: (
    clientId: string,
    values: { weight_kg: number; reps: number; is_completed: boolean },
  ) => void;
  onRemove: (clientId: string) => void;
  /** Set to false when the exercise must keep a fixed number of sets. */
  removable?: boolean;
  disabled?: boolean;
}

const numberInputClasses =
  'w-full min-h-[48px] rounded-lg border border-border-subtle bg-surface px-2 text-center text-lg font-bold text-ink tabular-nums focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';

/** Parses a numeric input, treating an empty field as 0. */
function toNumber(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * One set of an exercise: set number, weight, reps and a completion toggle.
 *
 * Each set has its own weight and rep count, so the three rows of an
 * exercise never share a value. The previous session's values are shown
 * underneath as a reference.
 */
export function SetRow({
  set,
  previous,
  isDumbbell = false,
  onChange,
  onCommit,
  onRemove,
  removable = true,
  disabled,
}: SetRowProps) {
  const commit = (overrides?: Partial<{ weight_kg: number; reps: number; is_completed: boolean }>) => {
    onCommit?.(set.clientId, {
      weight_kg: overrides?.weight_kg ?? set.weight_kg,
      reps: overrides?.reps ?? set.reps,
      is_completed: overrides?.is_completed ?? set.is_completed,
    });
  };

  // A set is only usable once both numbers have been entered.
  const ready = set.weight_kg > 0 && set.reps > 0;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-center text-sm font-bold text-ink-faint tabular-nums">
          Set {set.set_number}
        </span>

        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`weight-${set.clientId}`}>
            Weight in kilograms for set {set.set_number}
          </label>
          <input
            id={`weight-${set.clientId}`}
            type="number"
            inputMode="decimal"
            step="0.5"
            min="0"
            disabled={disabled}
            value={Number.isFinite(set.weight_kg) ? set.weight_kg : 0}
            onChange={(event) => onChange(set.clientId, { weight_kg: toNumber(event.target.value) })}
            onBlur={() => commit()}
            placeholder="0"
            className={numberInputClasses}
          />
        </div>

        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor={`reps-${set.clientId}`}>
            Repetitions for set {set.set_number}
          </label>
          <input
            id={`reps-${set.clientId}`}
            type="number"
            inputMode="numeric"
            step="1"
            min="0"
            disabled={disabled}
            value={Number.isFinite(set.reps) ? set.reps : 0}
            onChange={(event) => onChange(set.clientId, { reps: Math.round(toNumber(event.target.value)) })}
            onBlur={() => commit()}
            placeholder="0"
            className={numberInputClasses}
          />
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const nextCompleted = !set.is_completed;
            onChange(set.clientId, { is_completed: nextCompleted });
            commit({ is_completed: nextCompleted });
          }}
          aria-label={
            set.is_completed
              ? `Mark set ${set.set_number} as not done`
              : `Mark set ${set.set_number} as done`
          }
          aria-pressed={set.is_completed}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 transition-colors ${
            set.is_completed
              ? 'border-accent bg-accent text-slate-950'
              : 'border-border-subtle text-ink-faint hover:border-accent/50'
          }`}
        >
          <Check className="h-6 w-6" aria-hidden="true" />
        </button>

        <button
          type="button"
          disabled={disabled || !removable}
          onClick={() => onRemove(set.clientId)}
          aria-label={`Remove set ${set.set_number}`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-danger/15 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-faint"
        >
          <Trash2 className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 pl-9">
        {previous ? (
          <p className="text-xs text-ink-faint">
            Last time:{' '}
            <span className="font-medium text-ink-muted">
              {previous.weight_kg} kg × {previous.reps}
            </span>
          </p>
        ) : (
          <p className="text-xs text-ink-faint">First time logging this set</p>
        )}
        <p className="shrink-0 text-xs text-ink-faint">
          {isDumbbell ? 'per dumbbell' : 'kg'}
          {!ready ? <span className="ml-1 text-warning">needs weight &amp; reps</span> : null}
        </p>
      </div>
    </div>
  );
}
