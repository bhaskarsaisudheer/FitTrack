-- Migration 002 — Workout schedule, per-session exercise records, set timestamps.
--
-- This migration is additive: it only adds columns, creates new tables and
-- backfills them from the rows that already exist. No table is dropped and
-- no workout history is deleted.
--
-- Apply with:  npm run migrate   (from the server folder)

USE workout_tracker;

-- ---------------------------------------------------------------------------
-- 1. Exercises
--    `is_dumbbell`  — marks an exercise whose weight is entered per dumbbell.
--                     Volume for these is counted as (weight x reps x 2).
--    `default_sets` — how many sets the exercise is performed with (3).
-- ---------------------------------------------------------------------------
ALTER TABLE exercises
    ADD COLUMN is_dumbbell BOOLEAN NOT NULL DEFAULT FALSE AFTER muscle_group,
    ADD COLUMN default_sets TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER is_dumbbell;

-- Derive the dumbbell flag from the seeded names so the existing library
-- is labelled correctly without touching any user-entered rows.
UPDATE exercises
SET is_dumbbell = TRUE
WHERE LOWER(name) LIKE '%dumbbell%';

-- ---------------------------------------------------------------------------
-- 2. Schedule — which weekday each exercise is trained on.
--    day_of_week: 1 = Monday ... 7 = Sunday (7 is the rest day).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercise_schedule (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    exercise_id   INT NOT NULL,
    day_of_week   TINYINT UNSIGNED NOT NULL,
    position      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_exercise_schedule (exercise_id, day_of_week),
    KEY idx_schedule_day (day_of_week),

    CONSTRAINT fk_schedule_exercise
        FOREIGN KEY (exercise_id) REFERENCES exercises (id)
        ON DELETE CASCADE,

    CONSTRAINT chk_schedule_day CHECK (day_of_week BETWEEN 1 AND 7)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- 3. Sessions — an explicit status so an unfinished workout can be resumed
--    and a finished one is never mistaken for an active session.
-- ---------------------------------------------------------------------------
ALTER TABLE workout_sessions
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'in_progress' AFTER notes,
    ADD COLUMN title VARCHAR(100) NULL AFTER status,
    ADD COLUMN ended_at DATETIME NULL AFTER duration_minutes,
    ADD KEY idx_sessions_status (status);

-- Sessions that already carry a duration or notes were finished earlier.
UPDATE workout_sessions
SET status = 'completed'
WHERE duration_minutes IS NOT NULL OR notes IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Workout exercises — the record of one exercise inside one session.
--    Sets hang off this table, which is what links an exercise to a session
--    and keeps its three sets together.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_exercises (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    session_id    INT NOT NULL,
    exercise_id   INT NOT NULL,
    position      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uq_session_exercise (session_id, exercise_id),
    KEY idx_workout_exercises_session (session_id),
    KEY idx_workout_exercises_exercise (exercise_id),

    CONSTRAINT fk_workout_exercises_session
        FOREIGN KEY (session_id) REFERENCES workout_sessions (id)
        ON DELETE CASCADE,

    CONSTRAINT fk_workout_exercises_exercise
        FOREIGN KEY (exercise_id) REFERENCES exercises (id)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- 5. Sets — link to the workout exercise, and record when a set was
--    completed and when it was last changed.
-- ---------------------------------------------------------------------------
ALTER TABLE workout_sets
    ADD COLUMN workout_exercise_id INT NULL AFTER exercise_id,
    ADD COLUMN completed_at DATETIME NULL AFTER is_completed,
    ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    ADD KEY idx_sets_workout_exercise (workout_exercise_id),
    ADD CONSTRAINT fk_sets_workout_exercise
        FOREIGN KEY (workout_exercise_id) REFERENCES workout_exercises (id)
        ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- 6. Backfill — rebuild the workout exercise records from the sets that
--    already exist, then attach every set to its record.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO workout_exercises (session_id, exercise_id, position)
SELECT ws.session_id,
       ws.exercise_id,
       MIN(ws.set_number)
FROM workout_sets ws
GROUP BY ws.session_id, ws.exercise_id;

UPDATE workout_sets ws
JOIN workout_exercises we
       ON we.session_id = ws.session_id
      AND we.exercise_id = ws.exercise_id
SET ws.workout_exercise_id = we.id;

-- ---------------------------------------------------------------------------
-- 7. Seed the Monday-Saturday programme.
--    Every exercise in the library is placed on the day it is trained.
--    Sunday stays empty — it is the rest day.
--    This can be re-run safely; existing rows keep their position.
-- ---------------------------------------------------------------------------
INSERT IGNORE INTO exercise_schedule (exercise_id, day_of_week, position)
SELECT e.id, s.day_of_week, s.position
FROM (
    SELECT 'Bench Press'              AS name, 1 AS day_of_week, 1 AS position UNION ALL
    SELECT 'Incline Dumbbell Press',       1,              2            UNION ALL
    SELECT 'Lat Pulldown',                 2,              1            UNION ALL
    SELECT 'Seated Cable Row',             2,              2            UNION ALL
    SELECT 'Barbell Squat',                3,              1            UNION ALL
    SELECT 'Leg Press',                    3,              2            UNION ALL
    SELECT 'Calf Raise',                   3,              3            UNION ALL
    SELECT 'Shoulder Press',               4,              1            UNION ALL
    SELECT 'Biceps Curl',                  4,              2            UNION ALL
    SELECT 'Triceps Pushdown',             4,              3            UNION ALL
    SELECT 'Bench Press',                  5,              1            UNION ALL
    SELECT 'Lat Pulldown',                 5,              2            UNION ALL
    SELECT 'Barbell Squat',                5,              3            UNION ALL
    SELECT 'Incline Dumbbell Press',       6,              1            UNION ALL
    SELECT 'Biceps Curl',                  6,              2            UNION ALL
    SELECT 'Triceps Pushdown',             6,              3
) s
JOIN exercises e ON e.name = s.name;

-- ---------------------------------------------------------------------------
-- 8. Set timestamps — stamp the completion time of the sets that were
--    already marked as done.
-- ---------------------------------------------------------------------------
UPDATE workout_sets
SET completed_at = CURRENT_TIMESTAMP
WHERE is_completed = TRUE AND completed_at IS NULL;
