import { Pause, Play, RotateCcw, Timer } from 'lucide-react';
import type { RestTimerState } from '../hooks/useRestTimer';
import { formatDuration } from '../utils/format';

const PRESETS = [60, 90, 120];

interface RestTimerProps {
  timer: RestTimerState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onDurationChange: (seconds: number) => void;
}

/** A compact rest timer that sits above the workout log. */
export function RestTimer({
  timer,
  onStart,
  onPause,
  onResume,
  onReset,
  onDurationChange,
}: RestTimerProps) {
  const isActive = timer.status === 'running' || timer.status === 'paused';
  const isFinished = timer.status === 'finished';

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        isFinished
          ? 'border-accent bg-accent/10'
          : isActive
            ? 'border-accent/40 bg-surface-raised'
            : 'border-border-subtle bg-surface-raised'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-ink-muted">
          <Timer className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">Rest timer</span>
        </div>
        <p
          className={`font-mono text-2xl font-bold tabular-nums ${
            isFinished ? 'text-accent' : 'text-ink'
          }`}
          aria-live="polite"
        >
          {formatDuration(timer.remaining)}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {isActive && timer.status === 'paused' ? (
          <button
            type="button"
            onClick={onResume}
            aria-label="Resume timer"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-slate-950"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : isActive ? (
          <button
            type="button"
            onClick={onPause}
            aria-label="Pause timer"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-hover text-ink"
          >
            <Pause className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            onClick={onStart}
            aria-label="Start timer"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-slate-950"
          >
            <Play className="h-5 w-5" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onClick={onReset}
          aria-label="Reset timer"
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-surface-hover text-ink-muted"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="ml-auto flex gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onDurationChange(preset)}
              aria-pressed={timer.duration === preset}
              className={`min-h-[40px] min-w-[52px] rounded-lg px-2 text-xs font-semibold transition-colors ${
                timer.duration === preset
                  ? 'bg-accent text-slate-950'
                  : 'bg-surface-hover text-ink-muted hover:text-ink'
              }`}
            >
              {preset}s
            </button>
          ))}
        </div>
      </div>

      {isFinished ? (
        <p className="mt-3 text-sm font-medium text-accent">
          Rest complete — ready for the next set.
        </p>
      ) : null}
    </div>
  );
}
