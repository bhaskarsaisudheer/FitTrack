import { Download, Moon, Scale, Sun, Timer } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { SelectInput } from '../components/Field';
import { useSettings } from '../hooks/useSettings';
import { ApiRequestError, api } from '../services/api';

const REST_OPTIONS = [
  { value: '45', label: '45 seconds' },
  { value: '60', label: '60 seconds' },
  { value: '90', label: '90 seconds' },
  { value: '120', label: '2 minutes' },
  { value: '180', label: '3 minutes' },
];

export function Settings() {
  const { settings, update } = useSettings();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exported, setExported] = useState(false);

  // Apply the theme preference to the document root.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'light') {
      root.classList.add('light');
    } else {
      root.classList.remove('light');
    }
  }, [settings.theme]);

  const handleExport = async () => {
    setExporting(true);
    setExportError(null);
    setExported(false);
    try {
      const workouts = await api.listWorkouts({ limit: 200 });
      const rows: string[] = [
        'date,exercise,set,weight_kg,reps,completed,duration_minutes,notes',
      ];

      for (const workout of workouts) {
        if (workout.exercise_names.length === 0) {
          rows.push(
            `${workout.workout_date},,,,,,${workout.duration_minutes ?? ''},"${(workout.notes ?? '').replace(/"/g, '""')}"`,
          );
          continue;
        }
        // The list endpoint returns summaries; fetch the detail for set-level rows.
        const detail = await api.getWorkout(workout.id);
        for (const set of detail.sets) {
          rows.push(
            [
              detail.workout_date,
              `"${set.exercise_name.replace(/"/g, '""')}"`,
              set.set_number,
              set.weight_kg,
              set.reps,
              set.is_completed ? 'yes' : 'no',
              detail.duration_minutes ?? '',
              `"${(detail.notes ?? '').replace(/"/g, '""')}"`,
            ].join(','),
          );
        }
      }

      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fittrack-export-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExported(true);
    } catch (err) {
      setExportError(
        err instanceof ApiRequestError ? err.displayMessage : 'Could not export your data.',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted">Preferences for your training</p>
      </div>

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2 text-ink-muted">
          <Scale className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Units</h2>
        </div>
        <SelectInput
          label="Default weight unit"
          name="weight-unit"
          value={settings.weight_unit}
          onChange={(event) =>
            update({ weight_unit: event.target.value as 'kg' | 'lb' })
          }
          options={[
            { value: 'kg', label: 'Kilograms (kg)' },
            { value: 'lb', label: 'Pounds (lb)' },
          ]}
          hint="Weights are always stored in kilograms so your history stays consistent."
        />
      </Card>

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2 text-ink-muted">
          {settings.theme === 'light' ? (
            <Sun className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4" aria-hidden="true" />
          )}
          <h2 className="text-sm font-semibold uppercase tracking-wide">Appearance</h2>
        </div>
        <SelectInput
          label="Theme"
          name="theme"
          value={settings.theme}
          onChange={(event) => update({ theme: event.target.value as 'dark' | 'light' | 'system' })}
          options={[
            { value: 'dark', label: 'Dark' },
            { value: 'light', label: 'Light' },
            { value: 'system', label: 'Follow system' },
          ]}
        />
      </Card>

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2 text-ink-muted">
          <Timer className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Rest timer</h2>
        </div>
        <SelectInput
          label="Default rest duration"
          name="rest-duration"
          value={String(settings.rest_duration)}
          onChange={(event) => update({ rest_duration: Number(event.target.value) })}
          options={REST_OPTIONS}
        />
      </Card>

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2 text-ink-muted">
          <Download className="h-4 w-4" aria-hidden="true" />
          <h2 className="text-sm font-semibold uppercase tracking-wide">Your data</h2>
        </div>
        <p className="mb-3 text-sm text-ink-muted">
          Download every logged set as a CSV file you can open in a spreadsheet.
        </p>
        <Button variant="secondary" fullWidth onClick={() => void handleExport()} disabled={exporting}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {exporting ? 'Preparing export…' : 'Export to CSV'}
        </Button>
        {exported ? (
          <p className="mt-3 text-sm text-success">Export downloaded.</p>
        ) : null}
        {exportError ? (
          <p role="alert" className="mt-3 rounded-xl bg-danger/10 p-3 text-sm text-danger">
            {exportError}
          </p>
        ) : null}
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">
          Account &amp; sync
        </h2>
        <p className="text-sm text-ink-muted">
          FitTrack currently runs in single-user mode, so your data stays on this device and the
          database you connect it to. Sign-in and multi-device sync are planned for a future
          release.
        </p>
      </Card>
    </div>
  );
}
