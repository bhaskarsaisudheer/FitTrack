/**
 * Training volume and repetition calculations.
 *
 * The convention used everywhere in the app:
 *
 *   • Volume of one set = weight_kg × reps
 *   • Total volume of an exercise = the sum of the volume of its
 *     **completed** sets only.
 *   • Total repetitions = the sum of the reps of its completed sets.
 *
 * Dumbbell exercises are entered as the load of a **single dumbbell**, so
 * the real load moved is weight × 2 × reps. `isDumbbell` switches that on.
 * Every screen and every API response uses these helpers, so the numbers
 * always agree with one another.
 */

/** The number of loads a single entered weight represents. */
export function loadMultiplier(isDumbbell: boolean): number {
  return isDumbbell ? 2 : 1;
}

/** Volume of one set, in kilograms. */
export function setVolume(
  weightKg: number,
  reps: number,
  isDumbbell = false,
): number {
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

/** Totals for a list of sets. Incomplete sets are ignored. */
export function totalsForSets(
  sets: readonly VolumeSet[],
  isDumbbell = false,
): { volume: number; reps: number; completed: number } {
  let volume = 0;
  let reps = 0;
  let completed = 0;

  for (const set of sets) {
    if (!set.is_completed) continue;
    completed += 1;
    reps += set.reps;
    volume += setVolume(set.weight_kg, set.reps, isDumbbell);
  }

  return { volume: round2(volume), reps, completed };
}
