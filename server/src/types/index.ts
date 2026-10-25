/** Shared API types — these mirror the shapes returned by the Express API. */

/** Weekday index used across the app: 1 = Monday … 7 = Sunday. */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface Exercise {
  id: number;
  name: string;
  muscle_group: string | null;
  /** True when the entered weight is the load of a single dumbbell. */
  is_dumbbell: boolean;
  /** How many sets the exercise is performed with. */
  default_sets: number;
  created_at: string;
  /** Days of the week this exercise is scheduled on (1 = Monday … 7 = Sunday). */
  schedule_days: number[];
}

export interface WorkoutSet {
  id: number;
  session_id: number;
  exercise_id: number;
  workout_exercise_id: number | null;
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
  completed_at: string | null;
}

export interface WorkoutSetWithExercise extends WorkoutSet {
  exercise_name: string;
  muscle_group: string | null;
  is_dumbbell: boolean;
}

export interface WorkoutSession {
  id: number;
  workout_date: string;
  /** The weekday the session belongs to: 1 = Monday … 7 = Sunday. */
  day_of_week: number | null;
  start_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
  /** `in_progress` while the session is still open, `completed` once finished. */
  status: 'in_progress' | 'completed';
  title: string | null;
  ended_at: string | null;
  created_at: string;
}

/** One exercise inside one session, with its sets. */
export interface WorkoutExerciseRecord {
  id: number;
  session_id: number;
  exercise_id: number;
  position: number;
  exercise_name: string;
  muscle_group: string | null;
  is_dumbbell: boolean;
  sets: WorkoutSetWithExercise[];
  total_reps: number;
  total_volume: number;
  completed_sets: number;
}

/** A set joined with the exercise name, ready for display. */
export interface WorkoutSessionDetail extends WorkoutSession {
  sets: WorkoutSetWithExercise[];
  exercises: WorkoutExerciseRecord[];
  total_reps: number;
  total_volume: number;
  total_sets: number;
  completed_sets: number;
  exercise_names: string[];
}

/** A session as it appears in the history list. */
export interface SessionListItem extends WorkoutSession {
  exercise_names: string[];
  total_sets: number;
  completed_sets: number;
  total_reps: number;
  total_volume: number;
}

/** One exercise in the weekly programme. */
export interface ScheduleEntry {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  is_dumbbell: boolean;
  default_sets: number;
  position: number;
}

/** The full Monday–Saturday programme, keyed by day of week. */
export interface WeeklySchedule {
  /** Day index (1 = Monday … 7 = Sunday) mapped to its exercises. */
  days: Record<number, ScheduleEntry[]>;
  /** The day index of the next training day, or null during the rest week. */
  rest_day: 7;
}

// ---------------------------------------------------------------------------
// Progress tracker
// ---------------------------------------------------------------------------

export interface TrackerSet {
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
}

/** One recorded session for the selected exercise. */
export interface TrackerSession {
  session_id: number;
  workout_date: string;
  sets: TrackerSet[];
  total_reps: number;
  total_volume: number;
  completed_sets: number;
  /** Heaviest weight used in the session. */
  top_weight: number;
}

/** The difference between the latest session and the one before it. */
export interface TrackerDelta {
  weight: number | null;
  reps: number | null;
  volume: number | null;
  direction: 'up' | 'down' | 'flat' | 'none';
}

/** Personal records for one exercise, taken from saved sessions only. */
export interface ExerciseRecords {
  /** Heaviest weight ever used. */
  highest_weight: number | null;
  highest_weight_date: string | null;
  highest_weight_reps: number | null;
  /** Most repetitions completed at a single weight. */
  most_reps: number | null;
  most_reps_weight: number | null;
  most_reps_date: string | null;
  /** Largest total volume achieved in one session. */
  best_volume: number | null;
  best_volume_date: string | null;
}

/** The full progress tracker payload for one exercise. */
export interface ExerciseTracker {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string | null;
  is_dumbbell: boolean;
  /** Recorded sessions, oldest first. */
  sessions: TrackerSession[];
  latest: TrackerSession | null;
  previous: TrackerSession | null;
  /** Change from the previous session to the latest one. */
  delta: TrackerDelta;
  records: ExerciseRecords;
}

/** Totals for one week, with the week before it for comparison. */
export interface WeekTotals {
  week_start: string;
  week_end: string;
  workouts: number;
  exercises_completed: number;
  completed_sets: number;
  total_reps: number;
  total_volume: number;
}

export interface WeeklyOverview {
  current: WeekTotals;
  previous: WeekTotals;
}

/** A personal record for one exercise. */
export interface PersonalRecord {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string | null;
  is_dumbbell: boolean;
  best_weight: number;
  best_weight_reps: number | null;
  achieved_on: string;
  /** Most repetitions performed at a single weight. */
  best_reps: number | null;
  best_reps_weight: number | null;
  best_reps_on: string | null;
  /** Largest volume achieved in a single session. */
  best_volume: number | null;
  best_volume_on: string | null;
}

export interface ProgressSummary {
  total_sessions: number;
  total_exercises: number;
  total_sets: number;
  completed_sets: number;
  total_volume: number;
  workouts_this_week: number;
  personal_records: PersonalRecord[];
  volume_by_date: Array<{ workout_date: string; volume: number; sessions: number }>;
  weekly: WeeklyOverview;
}

/** The legacy per-exercise progress payload. */
export interface ExerciseProgress {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string | null;
  personal_best_weight: number | null;
  personal_best_date: string | null;
  total_volume: number;
  total_completed_sets: number;
  history: Array<{
    session_id: number;
    workout_date: string;
    top_weight: number;
    total_reps: number;
    total_volume: number;
    best_set: { weight_kg: number; reps: number; set_number: number } | null;
    sets: Array<{ set_number: number; weight_kg: number; reps: number; is_completed: boolean }>;
  }>;
  completed_sets: Array<{
    workout_date: string;
    session_id: number;
    set_number: number;
    weight_kg: number;
    reps: number;
    volume: number;
  }>;
}
