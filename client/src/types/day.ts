/** Types for the day programme, its history and the session comparison. */

/** One exercise of a day's programme. */
export interface DayProgrammeExercise {
  exercise_id: number;
  name: string;
  muscle_group: string | null;
  is_dumbbell: boolean;
  default_sets: number;
  position: number;
}

/** The programme of one day. */
export interface DayProgramme {
  day_of_week: number;
  day_name: string;
  title: string;
  estimated_minutes: number | null;
  is_rest_day: boolean;
  exercises: DayProgrammeExercise[];
}

/** One day of the week, for the dashboard strip. */
export interface WeekDay {
  day_of_week: number;
  day_name: string;
  short_name: string;
  title: string;
  estimated_minutes: number | null;
  is_rest_day: boolean;
  exercise_count: number;
}

/** A set of a previous session. */
export interface PreviousSet {
  set_number: number;
  weight_kg: number;
  reps: number;
  is_completed: boolean;
}

/** The previous session of a day. */
export interface DayPreviousSession {
  session_id: number;
  workout_date: string;
  duration_minutes: number | null;
  notes: string | null;
  total_exercises: number;
  completed_sets: number;
  total_sets: number;
  total_reps: number;
  total_volume: number;
  exercises: Array<{
    exercise_id: number;
    exercise_name: string;
    is_dumbbell: boolean;
    sets: PreviousSet[];
    total_reps: number;
    total_volume: number;
  }>;
}

/** A saved session of a day, as listed in the day's history. */
export interface DaySessionSummary {
  session_id: number;
  workout_date: string;
  day_of_week: number;
  status: 'in_progress' | 'completed';
  duration_minutes: number | null;
  total_exercises: number;
  completed_sets: number;
  total_sets: number;
  total_reps: number;
  total_volume: number;
}

/** The comparison of one exercise with its previous session. */
export interface ExerciseComparison {
  exercise_id: number;
  exercise_name: string;
  is_dumbbell: boolean;
  previous: {
    sets: PreviousSet[];
    total_reps: number;
    total_volume: number;
  } | null;
  current: {
    sets: PreviousSet[];
    total_reps: number;
    total_volume: number;
  };
  sets: Array<{
    set_number: number;
    previous_weight: number | null;
    previous_reps: number | null;
    current_weight: number | null;
    current_reps: number | null;
    weight_delta: number | null;
    reps_delta: number | null;
    direction: 'up' | 'down' | 'flat' | 'none';
  }>;
  volume_delta: number | null;
  volume_percent: number | null;
  reps_delta: number | null;
  direction: 'up' | 'down' | 'flat' | 'none';
}

/** The comparison of two saved sessions. */
export interface SessionComparison {
  session_a: {
    session_id: number;
    workout_date: string;
    total_reps: number;
    total_volume: number;
    completed_sets: number;
    exercises: Array<{
      exercise_id: number;
      exercise_name: string;
      sets: PreviousSet[];
      total_reps: number;
      total_volume: number;
    }>;
  };
  session_b: {
    session_id: number;
    workout_date: string;
    total_reps: number;
    total_volume: number;
    completed_sets: number;
    exercises: Array<{
      exercise_id: number;
      exercise_name: string;
      sets: PreviousSet[];
      total_reps: number;
      total_volume: number;
    }>;
  };
  volume_delta: number;
  volume_percent: number | null;
  reps_delta: number;
  direction: 'up' | 'down' | 'flat' | 'none';
  exercises: Array<{
    exercise_id: number;
    exercise_name: string;
    previous_volume: number;
    current_volume: number;
    volume_delta: number;
    volume_percent: number | null;
    direction: 'up' | 'down' | 'flat' | 'none';
  }>;
}
