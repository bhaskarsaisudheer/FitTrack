#!/usr/bin/env bash
# End-to-end smoke test for the FitTrack API.
# Usage: ./scripts/api-smoke-test.sh [base-url]
set -uo pipefail

BASE="${1:-http://127.0.0.1:5050}"
API="$BASE/api"
PASS=0
FAIL=0

check() {
  local label="$1" expected="$2" actual="$3"
  if [[ "$actual" == *"$expected"* ]]; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label"
    echo "        expected to contain: $expected"
    echo "        actual:              $actual"
    FAIL=$((FAIL + 1))
  fi
}

# Asserts that the value does NOT contain the given text.
check_absent() {
  local label="$1" unexpected="$2" actual="$3"
  if [[ "$actual" != *"$unexpected"* ]]; then
    echo "  PASS  $label"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  $label"
    echo "        expected NOT to contain: $unexpected"
    echo "        actual:                  $actual"
    FAIL=$((FAIL + 1))
  fi
}

# Extracts a numeric field from a JSON body.
json_id() {
  echo "$1" | sed -E 's/.*"id":([0-9]+).*/\1/'
}

echo "FitTrack API smoke test against $BASE"
echo

# --- Health -----------------------------------------------------------------
echo "Health"
check "health reports ok" '"status":"ok"' "$(curl -s "$API/health")"
check "database connected" '"database":"connected"' "$(curl -s "$API/health")"
echo

# --- Exercises --------------------------------------------------------------
echo "Exercises"
check "lists seeded exercises" 'Bench Press' "$(curl -s "$API/exercises")"
check "rejects empty name" '"code":"bad_request"' \
  "$(curl -s -X POST "$API/exercises" -H 'Content-Type: application/json' -d '{"name":"   "}')"
check "rejects non-numeric id" '"code":"bad_request"' "$(curl -s "$API/exercises/abc")"
check "rejects duplicate name" '"code":"duplicate"' \
  "$(curl -s -X POST "$API/exercises" -H 'Content-Type: application/json' -d '{"name":"Bench Press"}')"

EX_ID=$(json_id "$(curl -s -X POST "$API/exercises" -H 'Content-Type: application/json' \
  -d '{"name":"Smoke Test Exercise","muscle_group":"Test"}')")
check "creates an exercise" 'Smoke Test Exercise' \
  "$(curl -s "$API/exercises/$EX_ID")"

check "updates an exercise" 'Updated Name' \
  "$(curl -s -X PUT "$API/exercises/$EX_ID" -H 'Content-Type: application/json' -d '{"name":"Updated Name"}')"

check "search finds a match" 'Bench Press' "$(curl -s "$API/exercises?search=bench")"
check_absent "search excludes non-matches" 'Squat' "$(curl -s "$API/exercises?search=bench")"
check "filters by muscle group" 'Barbell Squat' "$(curl -s "$API/exercises?muscle_group=Legs")"
echo

# --- Workouts ---------------------------------------------------------------
echo "Workouts"
SESSION_ID=$(json_id "$(curl -s -X POST "$API/workouts" -H 'Content-Type: application/json' \
  -d '{"workout_date":"2026-10-20","start_time":"2026-10-20T18:30","notes":"smoke"}')")
check "creates a session" '"workout_date":"2026-10-20"' "$(curl -s "$API/workouts/$SESSION_ID")"
check "lists workouts" '"data"' "$(curl -s "$API/workouts")"
check "workout list includes exercise names" 'exercise_names' "$(curl -s "$API/workouts")"

check "rejects invalid date" '"code":"bad_request"' \
  "$(curl -s -X POST "$API/workouts" -H 'Content-Type: application/json' -d '{"workout_date":"20-10-2026"}')"
check "rejects impossible date" '"code":"bad_request"' \
  "$(curl -s -X POST "$API/workouts" -H 'Content-Type: application/json' -d '{"workout_date":"2026-13-45"}')"
check "rejects missing date" '"code":"bad_request"' \
  "$(curl -s -X POST "$API/workouts" -H 'Content-Type: application/json' -d '{}')"

check "updates a session" '"duration_minutes":45' \
  "$(curl -s -X PUT "$API/workouts/$SESSION_ID" -H 'Content-Type: application/json' -d '{"duration_minutes":45}')"
echo

# --- Sets -------------------------------------------------------------------
echo "Sets"
SET1=$(json_id "$(curl -s -X POST "$API/workouts/$SESSION_ID/sets" -H 'Content-Type: application/json' \
  -d '{"exercise_id":1,"weight_kg":20,"reps":12,"is_completed":true}')")
check "adds a set" '"weight_kg":20' \
  "$(curl -s "$API/sets/$SET1")"

check "rejects negative weight" '"code":"bad_request"' \
  "$(curl -s -X POST "$API/workouts/$SESSION_ID/sets" -H 'Content-Type: application/json' \
     -d '{"exercise_id":1,"weight_kg":-5,"reps":10}')"
check "rejects fractional reps" '"code":"bad_request"' \
  "$(curl -s -X POST "$API/workouts/$SESSION_ID/sets" -H 'Content-Type: application/json' \
     -d '{"exercise_id":1,"weight_kg":20,"reps":2.5}')"
check "rejects unknown exercise" '"code":"not_found"' \
  "$(curl -s -X POST "$API/workouts/$SESSION_ID/sets" -H 'Content-Type: application/json' \
     -d '{"exercise_id":999999,"weight_kg":20,"reps":10}')"
check "rejects unknown session" '"code":"not_found"' \
  "$(curl -s -X POST "$API/workouts/999999/sets" -H 'Content-Type: application/json' \
     -d '{"exercise_id":1,"weight_kg":20,"reps":10}')"

check "updates a set" '"reps":8' \
  "$(curl -s -X PUT "$API/sets/$SET1" -H 'Content-Type: application/json' -d '{"reps":8}')"
check "marks a set completed" '"is_completed":true' \
  "$(curl -s -X PUT "$API/sets/$SET1" -H 'Content-Type: application/json' -d '{"is_completed":true}')"

# Three sets, then delete the middle one and confirm renumbering.
curl -s -X POST "$API/workouts/$SESSION_ID/sets" -H 'Content-Type: application/json' \
  -d '{"exercise_id":1,"weight_kg":25,"reps":10,"is_completed":true}' > /dev/null
SET3=$(json_id "$(curl -s -X POST "$API/workouts/$SESSION_ID/sets" -H 'Content-Type: application/json' \
  -d '{"exercise_id":1,"weight_kg":30,"reps":8,"is_completed":true}')")
check "third set is numbered 3" '"set_number":3' "$(curl -s "$API/sets/$SET3")"

curl -s -X DELETE "$API/sets/$SET3" > /dev/null
SETS_AFTER=$(curl -s "$API/workouts/$SESSION_ID/sets")
check "deleted set is gone" '"count":2' "$SETS_AFTER"
check "remaining sets renumber to 1 and 2" '"set_number":1' "$SETS_AFTER"
check_absent "stale set number 3 is gone" '"set_number":3' "$SETS_AFTER"
check "renumbering keeps weights" '"weight_kg":25' "$SETS_AFTER"
echo

# --- Progress ---------------------------------------------------------------
echo "Progress"
check "summary returns totals" '"total_sessions"' "$(curl -s "$API/progress/summary")"
check "summary includes personal records" 'personal_records' "$(curl -s "$API/progress/summary")"
check "summary includes volume by date" 'volume_by_date' "$(curl -s "$API/progress/summary")"
check "exercise progress returns history" '"history"' "$(curl -s "$API/progress/1")"
check "exercise progress computes personal best" 'personal_best_weight' "$(curl -s "$API/progress/1")"
check "unknown exercise progress 404s" '"code":"not_found"' "$(curl -s "$API/progress/999999")"
check "previous performance returns last session" 'workout_date' "$(curl -s "$API/progress/1/previous")"

# Volume check: set 1 = 20kg x 8 reps = 160, set 2 = 25kg x 10 reps = 250.
check "session volume is computed" '"total_volume":410' "$(curl -s "$API/workouts/$SESSION_ID")"
echo

# --- Deletion & cascades ----------------------------------------------------
echo "Deletion"
check "deletes the exercise" '204' \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/exercises/$EX_ID")"
check "deletes the session" '204' \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$API/workouts/$SESSION_ID")"
check "session sets cascade-deleted" '"code":"not_found"' "$(curl -s "$API/workouts/$SESSION_ID")"

# An exercise used by a workout must refuse deletion.
USED_EX=$(json_id "$(curl -s -X POST "$API/exercises" -H 'Content-Type: application/json' \
  -d '{"name":"Guarded Exercise"}')")
GUARD_SESSION=$(json_id "$(curl -s -X POST "$API/workouts" -H 'Content-Type: application/json' \
  -d '{"workout_date":"2026-10-21"}')")
curl -s -X POST "$API/workouts/$GUARD_SESSION/sets" -H 'Content-Type: application/json' \
  -d "{\"exercise_id\":$USED_EX,\"weight_kg\":40,\"reps\":5,\"is_completed\":true}" > /dev/null
check "refuses to delete an exercise in use" '"code":"in_use"' \
  "$(curl -s -X DELETE "$API/exercises/$USED_EX")"
curl -s -X DELETE "$API/workouts/$GUARD_SESSION" > /dev/null
curl -s -X DELETE "$API/exercises/$USED_EX" > /dev/null

# --- Error handling ---------------------------------------------------------
echo "Error handling"
check "unknown route 404s" '"code":"not_found"' "$(curl -s "$API/does-not-exist")"
check "malformed JSON is rejected" '"code":"bad_request"' \
  "$(curl -s -X POST "$API/exercises" -H 'Content-Type: application/json' -d '{not json')"
echo

echo "-------------------------------------"
echo "Passed: $PASS   Failed: $FAIL"
echo "-------------------------------------"
[[ $FAIL -eq 0 ]] || exit 1
