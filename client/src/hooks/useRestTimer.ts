import { useCallback, useEffect, useRef, useState } from 'react';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished';

export interface RestTimerState {
  /** Seconds left on the clock. */
  remaining: number;
  status: TimerStatus;
  /** The configured duration in seconds. */
  duration: number;
  start: (seconds?: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setDuration: (seconds: number) => void;
}

/**
 * A countdown timer for rest periods between sets. The tick is driven by a
 * wall-clock deadline rather than by counting intervals, so the timer stays
 * accurate if the browser throttles the interval on a backgrounded tab.
 */
export function useRestTimer(defaultDuration = 90): RestTimerState {
  const [duration, setDurationState] = useState(defaultDuration);
  const [remaining, setRemaining] = useState(defaultDuration);
  const [status, setStatus] = useState<TimerStatus>('idle');
  const deadlineRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (deadlineRef.current !== null) {
      window.clearInterval(deadlineRef.current);
      deadlineRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (status !== 'running') return;

    const tick = () => {
      const deadline = deadlineRef.current;
      if (deadline === null) return;
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) {
        clear();
        setStatus('finished');
      }
    };

    deadlineRef.current = window.setInterval(tick, 250);
    return clear;
  }, [status, clear]);

  const start = useCallback(
    (seconds?: number) => {
      const total = seconds ?? duration;
      setDurationState(total);
      setRemaining(total);
      deadlineRef.current = Date.now() + total * 1000;
      setStatus('running');
    },
    [duration],
  );

  const pause = useCallback(() => {
    clear();
    setStatus('paused');
  }, [clear]);

  const resume = useCallback(() => {
    deadlineRef.current = Date.now() + remaining * 1000;
    setStatus('running');
  }, [remaining]);

  const reset = useCallback(() => {
    clear();
    setRemaining(duration);
    setStatus('idle');
  }, [clear, duration]);

  const setDuration = useCallback(
    (seconds: number) => {
      clear();
      setDurationState(seconds);
      setRemaining(seconds);
      setStatus('idle');
    },
    [clear],
  );

  return { remaining, status, duration, start, pause, resume, reset, setDuration };
}
