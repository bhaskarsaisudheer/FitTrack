/**
 * Training volume and repetition calculations.
 *
 * These mirror the server-side helpers exactly, so the numbers shown while
 * typing are the same as the numbers stored in MySQL.
 *
 *   • Volume of one set = weight_kg × reps
 *   • Total volume of an exercise = the sum of the volume of its
 *     **completed** sets only.
 *   • Total repetitions = the sum of the reps of its completed sets.
 *
 * Dumbbell exercises are entered as the load of a **single dumbbell**, so
 * the real load moved is weight × 2 × reps.
 */

/** The number of loads a single entered weight represents. */
export function loadMultiplier(isDumbbell: boolean): number {
  return isDumbbell ? 2 : 1;
}

/** Volume of one set, in kilograms. */
export function setVolume(weightKg: number, reps: number, isDumbbell = false): number {
  return weightKg * reps * loadMultiplier(isDumbbell);
}

/** Rounds to two decimals without floating-point noise. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface VolumeSet {
  weight_kg: number;
  reps: number;
  is_completed: boolean;
}

export interface SetTotals {
  /** Volume of the completed sets, in kilograms. */
  volume: number;
  /** Repetitions performed across the completed sets. */
  reps: number;
  /** How many sets were completed. */
  completed: number;
}

/**
 * Totals for a list of sets.
 *
 * Only completed sets that have both a weight and a rep count contribute.
 * A blank or half-entered set is left out rather than being treated as a
 * zero-weight completed set.
 */
export function totalsForSets(
  sets: readonly VolumeSet[],
  isDumbbell = false,
): SetTotals {
  let volume = 0;
  let reps = 0;
  let completed = 0;

  for (const set of sets) {
    if (!set.is_completed) continue;
    if (!isSetReady(set)) continue;

    completed += 1;
    reps += set.reps;
    volume += setVolume(set.weight_kg, set.reps, isDumbbell);
  }

  return { volume: round2(volume), reps, completed };
}

/** A set is ready to save once it has a weight and a rep count. */
export function isSetReady(set: VolumeSet): boolean {
  return set.weight_kg > 0 && set.reps > 0;
}

/** Counts the sets that still need a weight and a rep count. */
export function countIncomplete(sets: readonly VolumeSet[]): number {
  return sets.filter((set) => !isSetReady(set)).length;
}
