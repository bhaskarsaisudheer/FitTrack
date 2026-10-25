import { Pencil, Trash2 } from 'lucide-react';
import type { Exercise } from '../types';
import { capitalize } from '../utils/format';

interface ExerciseCardProps {
  exercise: Exercise;
  onEdit?: (exercise: Exercise) => void;
  onDelete?: (exercise: Exercise) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (exercise: Exercise) => void;
}

export function ExerciseCard({
  exercise,
  onEdit,
  onDelete,
  selectable = false,
  selected = false,
  onToggle,
}: ExerciseCardProps) {
  if (selectable) {
    return (
      <button
        type="button"
        onClick={() => onToggle?.(exercise)}
        aria-pressed={selected}
        className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors ${
          selected
            ? 'border-accent bg-accent/10'
            : 'border-border-subtle bg-surface-raised hover:border-accent/40'
        }`}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-ink">{exercise.name}</span>
          {exercise.muscle_group ? (
            <span className="mt-0.5 block text-sm text-ink-muted">
              {capitalize(exercise.muscle_group)}
            </span>
          ) : null}
        </span>
        <span
          aria-hidden="true"
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold ${
            selected ? 'border-accent bg-accent text-slate-950' : 'border-border-subtle'
          }`}
        >
          {selected ? '✓' : ''}
        </span>
      </button>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-raised p-4">
      <div className="min-w-0">
        <p className="truncate font-semibold text-ink">{exercise.name}</p>
        {exercise.muscle_group ? (
          <p className="mt-0.5 text-sm text-ink-muted">{capitalize(exercise.muscle_group)}</p>
        ) : (
          <p className="mt-0.5 text-sm text-ink-faint">No muscle group</p>
        )}
      </div>
      <div className="flex shrink-0 gap-1">
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(exercise)}
            aria-label={`Edit ${exercise.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(exercise)}
            aria-label={`Delete ${exercise.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-danger/15 hover:text-danger"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
