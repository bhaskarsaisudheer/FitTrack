-- FitTrack — Personal Workout Tracker
-- MySQL schema. Run against MySQL Workbench or the mysql CLI.
--
-- Usage:
--   mysql -u root -p < database/schema.sql
--
-- Every statement below is idempotent, so the script is safe to re-run.

CREATE DATABASE IF NOT EXISTS workout_tracker
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE workout_tracker;

-- ---------------------------------------------------------------------------
-- Exercises: the personal exercise library.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exercises (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    name          VARCHAR(100) NOT NULL,
    muscle_group  VARCHAR(50),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_exercises_name (name)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Workout sessions: one row per training session.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_sessions (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    workout_date     DATE NOT NULL,
    start_time       DATETIME,
    duration_minutes INT,
    notes            TEXT,
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY idx_sessions_date (workout_date)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Workout sets: one row per set. Storing each set independently lets the
-- progress screen compare the same exercise across sessions.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workout_sets (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    session_id   INT NOT NULL,
    exercise_id  INT NOT NULL,
    set_number   INT NOT NULL,
    weight_kg    DECIMAL(7, 2) NOT NULL DEFAULT 0,
    reps         INT NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uq_set_position (session_id, exercise_id, set_number),
    KEY idx_sets_exercise (exercise_id),
    KEY idx_sets_session (session_id),

    CONSTRAINT fk_sets_session
        FOREIGN KEY (session_id) REFERENCES workout_sessions (id)
        ON DELETE CASCADE,

    CONSTRAINT fk_sets_exercise
        FOREIGN KEY (exercise_id) REFERENCES exercises (id)
        ON DELETE RESTRICT
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------------
-- Seed data: the starter exercise library from the project spec.
-- ---------------------------------------------------------------------------
INSERT INTO exercises (name, muscle_group) VALUES
    ('Bench Press', 'Chest'),
    ('Incline Dumbbell Press', 'Chest'),
    ('Shoulder Press', 'Shoulders'),
    ('Lat Pulldown', 'Back'),
    ('Seated Cable Row', 'Back'),
    ('Barbell Squat', 'Legs'),
    ('Leg Press', 'Legs'),
    ('Biceps Curl', 'Biceps'),
    ('Triceps Pushdown', 'Triceps'),
    ('Calf Raise', 'Calves')
ON DUPLICATE KEY UPDATE muscle_group = VALUES(muscle_group);
