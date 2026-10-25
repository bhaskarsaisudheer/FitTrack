import { Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../components/Button';
import { ExerciseCard } from '../components/ExerciseCard';
import { Modal } from '../components/Modal';
import { TextInput } from '../components/Field';
import { EmptyState, ErrorState, LoadingState } from '../components/States';
import { ApiRequestError, api } from '../services/api';
import type { Exercise } from '../types';

const MUSCLE_GROUPS = [
  'Chest',
  'Back',
  'Shoulders',
  'Arms',
  'Biceps',
  'Triceps',
  'Legs',
  'Glutes',
  'Calves',
  'Core',
  'Full Body',
];

export function Exercises() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);
  const [name, setName] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pendingDelete, setPendingDelete] = useState<Exercise | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listExercises({}, signal);
      setExercises(data);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(
        err instanceof ApiRequestError
          ? err.displayMessage
          : 'Could not load the exercise library.',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Filtering happens locally so the list stays instant while typing.
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      const matchesTerm =
        term === '' ||
        exercise.name.toLowerCase().includes(term) ||
        (exercise.muscle_group ?? '').toLowerCase().includes(term);
      const matchesGroup = groupFilter === null || exercise.muscle_group === groupFilter;
      return matchesTerm && matchesGroup;
    });
  }, [exercises, search, groupFilter]);

  const groupsInUse = useMemo(() => {
    const groups = new Set(
      exercises.map((exercise) => exercise.muscle_group).filter((group): group is string => !!group),
    );
    return [...groups].sort();
  }, [exercises]);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setMuscleGroup('');
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (exercise: Exercise) => {
    setEditing(exercise);
    setName(exercise.name);
    setMuscleGroup(exercise.muscle_group ?? '');
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed === '') {
      setFormError('Enter an exercise name.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = { name: trimmed, muscle_group: muscleGroup.trim() || null };
      if (editing) {
        await api.updateExercise(editing.id, payload);
      } else {
        await api.createExercise(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not save the exercise.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleteError(null);
    try {
      await api.deleteExercise(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (err) {
      setDeleteError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not delete the exercise.',
      );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Exercise Library</h1>
          <p className="text-sm text-ink-muted">
            {exercises.length} exercise{exercises.length === 1 ? '' : 's'} available
          </p>
        </div>
        <Button onClick={openCreate} className="shrink-0">
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Add Exercise</span>
        </Button>
      </div>

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search exercises…"
          aria-label="Search exercises"
          className="min-h-[48px] w-full rounded-xl border border-border-subtle bg-surface-raised pl-10 pr-10 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
        {search ? (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-faint hover:text-ink"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {groupsInUse.length > 0 ? (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
          <button
            type="button"
            onClick={() => setGroupFilter(null)}
            aria-pressed={groupFilter === null}
            className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
              groupFilter === null
                ? 'bg-accent text-slate-950'
                : 'bg-surface-raised text-ink-muted hover:text-ink'
            }`}
          >
            All
          </button>
          {groupsInUse.map((group) => (
            <button
              key={group}
              type="button"
              onClick={() => setGroupFilter(group === groupFilter ? null : group)}
              aria-pressed={groupFilter === group}
              className={`min-h-[40px] shrink-0 rounded-full px-4 text-sm font-medium capitalize transition-colors ${
                groupFilter === group
                  ? 'bg-accent text-slate-950'
                  : 'bg-surface-raised text-ink-muted hover:text-ink'
              }`}
            >
              {group}
            </button>
          ))}
        </div>
      ) : null}

      {loading ? (
        <LoadingState label="Loading exercises…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void load()} />
      ) : visible.length === 0 ? (
        <EmptyState
          title={exercises.length === 0 ? 'No exercises yet' : 'No matches found'}
          description={
            exercises.length === 0
              ? 'Add your first exercise to start logging workouts.'
              : 'Try a different search term or clear the muscle group filter.'
          }
          action={
            exercises.length === 0 ? (
              <Button onClick={openCreate} className="mt-2">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Exercise
              </Button>
            ) : null
          }
        />
      ) : (
        <ul className="space-y-2.5">
          {visible.map((exercise) => (
            <li key={exercise.id}>
              <ExerciseCard
                exercise={exercise}
                onEdit={openEdit}
                onDelete={(target) => {
                  setDeleteError(null);
                  setPendingDelete(target);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={modalOpen}
        title={editing ? 'Edit Exercise' : 'Add Exercise'}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button fullWidth onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add Exercise'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="Exercise name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Bench Press"
            error={formError ?? undefined}
            autoComplete="off"
          />
          <div>
            <label
              htmlFor="muscle-group"
              className="mb-1.5 block text-sm font-medium text-ink-muted"
            >
              Muscle group
            </label>
            <input
              id="muscle-group"
              list="muscle-groups"
              value={muscleGroup}
              onChange={(event) => setMuscleGroup(event.target.value)}
              placeholder="e.g. Chest"
              autoComplete="off"
              className="min-h-[48px] w-full rounded-xl border border-border-subtle bg-surface px-3.5 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
            <datalist id="muscle-groups">
              {MUSCLE_GROUPS.map((group) => (
                <option key={group} value={group} />
              ))}
            </datalist>
          </div>
        </div>
      </Modal>

      <Modal
        open={pendingDelete !== null}
        title="Delete Exercise"
        onClose={() => setPendingDelete(null)}
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" fullWidth onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" fullWidth onClick={() => void handleDelete()}>
              Delete
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-muted">
          Delete <span className="font-semibold text-ink">{pendingDelete?.name}</span> from the
          library?
        </p>
        {deleteError ? (
          <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
            {deleteError}
          </p>
        ) : null}
      </Modal>
    </div>
  );
}
