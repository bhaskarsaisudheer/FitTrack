-- Migration 003 — Day programme, programme titles and the day a session
-- belongs to.
--
-- This migration is additive. It adds columns, creates one new table and
-- updates the programme rows. No existing workout history is deleted, and
-- every existing session is kept and linked to the weekday it was logged.

USE workout_tracker;

-- ---------------------------------------------------------------------------
-- 1. Sessions get the weekday they belong to, so the history of "Monday"
--    can be listed without scanning every date.
--    day_of_week: 1 = Monday … 7 = Sunday (7 is the rest day).
-- ---------------------------------------------------------------------------
ALTER TABLE workout_sessions
    ADD COLUMN day_of_week TINYINT UNSIGNED NULL AFTER workout_date,
    ADD KEY idx_sessions_day (day_of_week);

-- Backfill from the date the session was logged. WEEKDAY() already uses
-- 1 = Monday … 7 = Sunday, which is the same convention as the schedule.
UPDATE workout_sessions
SET day_of_week = WEEKDAY(workout_date)
WHERE day_of_week IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Programme titles — the short name shown for each training day.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS day_programme (
    day_of_week       TINYINT UNSIGNED NOT NULL PRIMARY KEY,
    title             VARCHAR(60) NOT NULL,
    estimated_minutes INT UNSIGNED NULL,
    is_rest_day       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT chk_programme_day CHECK (day_of_week BETWEEN 1 AND 7)
) ENGINE = InnoDB;

INSERT INTO day_programme (day_of_week, title, estimated_minutes, is_rest_day)
VALUES
    (1, 'Chest + Triceps', 75, FALSE),
    (2, 'Back + Biceps',   70, FALSE),
    (3, 'Shoulders',       60, FALSE),
    (4, 'Chest + Triceps', 75, FALSE),
    (5, 'Back + Biceps',   70, FALSE),
    (6, 'Legs',            70, FALSE),
    (7, 'Rest Day',        NULL, TRUE)
ON DUPLICATE KEY UPDATE
    title = VALUES(title),
    estimated_minutes = VALUES(estimated_minutes),
    is_rest_day = VALUES(is_rest_day);

-- ---------------------------------------------------------------------------
-- 3. The exercise library gains the exercises the programme needs.
--    Existing exercises are never deleted — the ones that are no longer in
--    the programme stay in the library and keep their history.
-- ---------------------------------------------------------------------------
INSERT INTO exercises (name, muscle_group, is_dumbbell, default_sets) VALUES
    ('Flat Bench Press',                'Chest',     FALSE, 3),
    ('Pec Deck Fly',                    'Chest',     FALSE, 3),
    ('Cable Lower-Chest Fly',            'Chest',     FALSE, 3),
    ('Rope Triceps Pushdown',           'Triceps',   FALSE, 3),
    ('Single-Arm Reverse-Grip Pushdown', 'Triceps',   FALSE, 3),
    ('Overhead Cable Triceps Extension','Triceps',   FALSE, 3),
    ('Barbell Row',                     'Back',      FALSE, 3),
    ('Deadlift',                        'Back',      FALSE, 3),
    ('Hammer Curl',                     'Biceps',    FALSE, 3),
    ('Lateral Raise',                   'Shoulders', FALSE, 3),
    ('Rear Delt Fly',                   'Shoulders', FALSE, 3),
    ('Front Raise',                     'Shoulders', FALSE, 3),
    ('Face Pull',                       'Shoulders', FALSE, 3),
    ('Romanian Deadlift',               'Legs',      FALSE, 3),
    ('Leg Curl',                        'Legs',      FALSE, 3),
    ('Walking Lunge',                   'Legs',      FALSE, 3)
ON DUPLICATE KEY UPDATE
    muscle_group = VALUES(muscle_group),
    default_sets = VALUES(default_sets);

-- The exercises that carry the load in one hand are entered per dumbbell.
UPDATE exercises
SET is_dumbbell = TRUE
WHERE LOWER(name) LIKE '%dumbbell%'
   OR LOWER(name) IN ('hammer curl', 'single-arm reverse-grip pushdown');

-- ---------------------------------------------------------------------------
-- 4. The programme itself.
--    Monday and Thursday are Chest + Triceps, Tuesday and Friday are
--    Back + Biceps, Wednesday is Shoulders, Saturday is Legs and Sunday
--    is the rest day.
-- ---------------------------------------------------------------------------
DELETE FROM exercise_schedule;

INSERT INTO exercise_schedule (exercise_id, day_of_week, position)
SELECT e.id, s.day_of_week, s.position
FROM (
    -- Monday and Thursday: Chest + Triceps
    SELECT 'Incline Dumbbell Press'            AS name, 1 AS day_of_week, 1 AS position UNION ALL
    SELECT 'Flat Bench Press',                      1,              2            UNION ALL
    SELECT 'Pec Deck Fly',                          1,              3            UNION ALL
    SELECT 'Cable Lower-Chest Fly',                 1,              4            UNION ALL
    SELECT 'Rope Triceps Pushdown',                 1,              5            UNION ALL
    SELECT 'Single-Arm Reverse-Grip Pushdown',      1,              6            UNION ALL
    SELECT 'Overhead Cable Triceps Extension',      1,              7            UNION ALL
    SELECT 'Incline Dumbbell Press',                4,              1            UNION ALL
    SELECT 'Flat Bench Press',                      4,              2            UNION ALL
    SELECT 'Pec Deck Fly',                          4,              3            UNION ALL
    SELECT 'Cable Lower-Chest Fly',                 4,              4            UNION ALL
    SELECT 'Rope Triceps Pushdown',                 4,              5            UNION ALL
    SELECT 'Single-Arm Reverse-Grip Pushdown',      4,              6            UNION ALL
    SELECT 'Overhead Cable Triceps Extension',      4,              7            UNION ALL

    -- Tuesday and Friday: Back + Biceps
    SELECT 'Lat Pulldown',                          2,              1            UNION ALL
    SELECT 'Seated Cable Row',                      2,              2            UNION ALL
    SELECT 'Barbell Row',                           2,              3            UNION ALL
    SELECT 'Deadlift',                              2,              4            UNION ALL
    SELECT 'Biceps Curl',                           2,              5            UNION ALL
    SELECT 'Hammer Curl',                           2,              6            UNION ALL
    SELECT 'Lat Pulldown',                          5,              1            UNION ALL
    SELECT 'Seated Cable Row',                      5,              2            UNION ALL
    SELECT 'Barbell Row',                           5,              3            UNION ALL
    SELECT 'Deadlift',                              5,              4            UNION ALL
    SELECT 'Biceps Curl',                           5,              5            UNION ALL
    SELECT 'Hammer Curl',                           5,              6            UNION ALL

    -- Wednesday: Shoulders
    SELECT 'Shoulder Press',                        3,              1            UNION ALL
    SELECT 'Lateral Raise',                         3,              2            UNION ALL
    SELECT 'Rear Delt Fly',                         3,              3            UNION ALL
    SELECT 'Front Raise',                           3,              4            UNION ALL
    SELECT 'Face Pull',                             3,              5            UNION ALL

    -- Saturday: Legs
    SELECT 'Barbell Squat',                         6,              1            UNION ALL
    SELECT 'Leg Press',                             6,              2            UNION ALL
    SELECT 'Romanian Deadlift',                     6,              3            UNION ALL
    SELECT 'Leg Curl',                              6,              4            UNION ALL
    SELECT 'Walking Lunge',                         6,              5            UNION ALL
    SELECT 'Calf Raise',                            6,              6
) s
JOIN exercises e ON e.name = s.name;
