import type {
  DayProgramme,
  DayPreviousSession,
  DaySessionSummary,
  Exercise,
  ExerciseProgress,
  ExerciseTracker,
  PersonalRecord,
  PreviousPerformance,
  ProgressSummary,
  ScheduleEntry,
  SessionComparison,
  WeeklyOverview,
  WeekDay,
  WeeklySchedule,
  WorkoutSession,
  WorkoutSessionDetail,
  WorkoutSessionSummary,
  WorkoutSet,
} from '../types';

/**
 * Base URL of the FitTrack API.
 *
 * In development the Vite dev server proxies `/api` to the Express backend
 * (see vite.config.ts), so a relative URL is used. In production this can be
 * pointed at a deployed backend with VITE_API_BASE_URL.
 */
export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

/** Error thrown by the API layer, carrying the server's error code. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Array<{ field: string; message: string }>;

  constructor(
    status: number,
    message: string,
    code = 'error',
    details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** A human-readable message suitable for showing in the UI. */
  get displayMessage(): string {
    if (this.details && this.details.length > 0) {
      return this.details.map((detail) => detail.message).join(' ');
    }
    return this.message;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * Performs a request against the API and unwraps the `{ data }` envelope.
 * Network failures surface as an ApiRequestError so callers can show a
 * friendly message instead of an unhandled rejection.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new ApiRequestError(
      0,
      'Could not reach the server. Check that the API is running and try again.',
      'network_error',
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiRequestError(
      response.status,
      'The server returned an unreadable response.',
      'invalid_response',
    );
  }

  if (!response.ok) {
    const errorBody = payload as {
      error?: {
        code?: string;
        message?: string;
        details?: Array<{ field: string; message: string }>;
      };
    };
    throw new ApiRequestError(
      response.status,
      errorBody?.error?.message ?? 'The request failed.',
      errorBody?.error?.code ?? 'error',
      errorBody?.error?.details,
    );
  }

  return (payload as { data: T }).data;
}

/** Builds a query string, skipping empty values. */
function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

export const api = {
  health: (signal?: AbortSignal) =>
    request<{ status: string; database: string }>('/health', { signal }),

  // --- Exercises -----------------------------------------------------------
  listExercises: (
    params: { search?: string; muscle_group?: string } = {},
    signal?: AbortSignal,
  ) => request<Exercise[]>(`/exercises${queryString(params)}`, { signal }),

  createExercise: (input: {
    name: string;
    muscle_group?: string | null;
    is_dumbbell?: boolean;
    default_sets?: number;
  }) => request<Exercise>('/exercises', { method: 'POST', body: input }),

  updateExercise: (
    id: number,
    input: {
      name?: string;
      muscle_group?: string | null;
      is_dumbbell?: boolean;
      default_sets?: number;
    },
  ) => request<Exercise>(`/exercises/${id}`, { method: 'PUT', body: input }),

  deleteExercise: (id: number) => request<void>(`/exercises/${id}`, { method: 'DELETE' }),

  // --- Workouts ------------------------------------------------------------
  listWorkouts: (
    params: { limit?: number; offset?: number; from?: string; to?: string } = {},
    signal?: AbortSignal,
  ) => request<WorkoutSessionSummary[]>(`/workouts${queryString(params)}`, { signal }),

  getWorkout: (id: number, signal?: AbortSignal) =>
    request<WorkoutSessionDetail>(`/workouts/${id}`, { signal }),

  createWorkout: (input: {
    workout_date: string;
    /** The weekday of the session: 1 = Monday … 7 = Sunday. */
    day_of_week?: number;
    start_time?: string | null;
    duration_minutes?: number | null;
    notes?: string | null;
    status?: 'in_progress' | 'completed';
    title?: string | null;
  }) => request<WorkoutSession>('/workouts', { method: 'POST', body: input }),

  updateWorkout: (
    id: number,
    input: {
      workout_date?: string;
      start_time?: string | null;
      duration_minutes?: number | null;
      notes?: string | null;
      status?: 'in_progress' | 'completed';
      title?: string | null;
    },
  ) => request<WorkoutSession>(`/workouts/${id}`, { method: 'PUT', body: input }),

  /** Returns the unfinished session for a date, or null. */
  getOpenWorkout: (date: string, signal?: AbortSignal) =>
    request<WorkoutSessionDetail | null>(`/workouts/open${queryString({ date })}`, { signal }),

  deleteWorkout: (id: number) => request<void>(`/workouts/${id}`, { method: 'DELETE' }),

  // --- Sets ----------------------------------------------------------------
  listSets: (sessionId: number, signal?: AbortSignal) =>
    request<WorkoutSet[]>(`/workouts/${sessionId}/sets`, { signal }),

  createSet: (
    sessionId: number,
    input: {
      exercise_id: number;
      set_number?: number;
      weight_kg: number;
      reps: number;
      is_completed: boolean;
    },
  ) => request<WorkoutSet>(`/workouts/${sessionId}/sets`, { method: 'POST', body: input }),

  /** Saves the three sets of one exercise in a single request. */
  saveExerciseSets: (
    sessionId: number,
    input: {
      exercise_id: number;
      sets: Array<{
        set_number: number;
        weight_kg: number;
        reps: number;
        is_completed: boolean;
      }>;
    },
  ) => request<WorkoutSet[]>(`/workouts/${sessionId}/sets`, { method: 'PUT', body: input }),

  updateSet: (
    id: number,
    input: {
      exercise_id?: number;
      set_number?: number;
      weight_kg?: number;
      reps?: number;
      is_completed?: boolean;
    },
  ) => request<WorkoutSet>(`/sets/${id}`, { method: 'PUT', body: input }),

  deleteSet: (id: number) => request<void>(`/sets/${id}`, { method: 'DELETE' }),

  // --- Progress ------------------------------------------------------------
  getProgressSummary: (signal?: AbortSignal) =>
    request<ProgressSummary>('/progress/summary', { signal }),

  getExerciseProgress: (exerciseId: number, signal?: AbortSignal) =>
    request<ExerciseProgress>(`/progress/${exerciseId}`, { signal }),

  getPreviousPerformance: (exerciseId: number, beforeDate?: string, signal?: AbortSignal) =>
    request<PreviousPerformance | null>(
      `/progress/${exerciseId}/previous${queryString({ before_date: beforeDate })}`,
      { signal },
    ),

  // --- Progress tracker ----------------------------------------------------
  getTracker: (
    exerciseId: number,
    params: { from?: string; to?: string } = {},
    signal?: AbortSignal,
  ) => request<ExerciseTracker>(`/tracker/${exerciseId}${queryString(params)}`, { signal }),

  getPersonalRecords: (signal?: AbortSignal) =>
    request<PersonalRecord[]>('/tracker/records', { signal }),

  getWeeklyOverview: (signal?: AbortSignal) =>
    request<WeeklyOverview>('/tracker/weekly', { signal }),

  // --- Schedule ------------------------------------------------------------
  getSchedule: (signal?: AbortSignal) => request<WeeklySchedule>('/schedule', { signal }),

  getDaySchedule: (day: number, signal?: AbortSignal) =>
    request<ScheduleEntry[]>(`/schedule/${day}`, { signal }),

  setDaySchedule: (day: number, exerciseIds: number[]) =>
    request<ScheduleEntry[]>(`/schedule/${day}`, {
      method: 'PUT',
      body: { exercise_ids: exerciseIds },
    }),

  // --- Day programme --------------------------------------------------------
  /** The whole week, for the dashboard strip. */
  getWeekProgramme: (signal?: AbortSignal) => request<WeekDay[]>('/days/week', { signal }),

  /** The programme of one day, with its exercises. */
  getDayProgramme: (day: number, signal?: AbortSignal) =>
    request<DayProgramme>(`/days/${day}`, { signal }),

  /** The previous completed session of a day, with every set. */
  getDayPreviousSession: (day: number, beforeDate?: string, signal?: AbortSignal) =>
    request<DayPreviousSession | null>(
      `/days/${day}/previous${queryString({ before_date: beforeDate })}`,
      { signal },
    ),

  /** Every saved session of a day, newest first. */
  getDaySessions: (day: number, signal?: AbortSignal) =>
    request<DaySessionSummary[]>(`/days/${day}/sessions`, { signal }),

  /** Replaces the programme of a day. */
  setDayProgramme: (day: number, exerciseIds: number[], title?: string) =>
    request<DayProgramme>(`/days/${day}`, {
      method: 'PUT',
      body: { exercise_ids: exerciseIds, ...(title ? { title } : {}) },
    }),

  /** Compares two saved sessions side by side. */
  compareSessions: (sessionA: number, sessionB: number, signal?: AbortSignal) =>
    request<SessionComparison>(`/days/compare${queryString({ a: sessionA, b: sessionB })}`, {
      signal,
    }),
};
