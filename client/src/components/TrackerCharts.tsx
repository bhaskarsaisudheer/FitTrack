import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface SetWeightPoint {
  date: string;
  set1: number | null;
  set2: number | null;
  set3: number | null;
}

export interface VolumePoint {
  date: string;
  volume: number;
  reps: number;
}

interface TooltipEntry {
  value?: number | string;
  dataKey?: string | number;
  name?: string;
  color?: string;
}

interface TooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  unit?: string;
  /** When true the payload holds several series and is listed in full. */
  multi?: boolean;
}

/** A tooltip styled to match the rest of the app. */
function ChartTooltip({ active, payload, label, unit = 'kg', multi = false }: TooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-raised px-3 py-2 shadow-lg">
      <p className="text-xs text-ink-faint">{label}</p>
      {multi ? (
        <ul className="mt-1 space-y-0.5">
          {payload.map((entry) => (
            <li key={String(entry.dataKey)} className="text-xs font-semibold text-ink tabular-nums">
              <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
              {entry.name}: {entry.value} {unit}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-sm font-semibold text-ink tabular-nums">
          {payload[0]?.value} {unit}
        </p>
      )}
    </div>
  );
}

const AXIS_PROPS = {
  stroke: '#64748b',
  tick: { fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/**
 * Weight progression: the weight used for set 1, set 2 and set 3 across
 * workout dates. A missing set is left out of the line instead of being
 * drawn as a zero.
 */
export function SetWeightChart({ data }: { data: SetWeightPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="date" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} domain={['dataMin - 5', 'dataMax + 5']} />
        <Tooltip content={<ChartTooltip multi />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: '#94a3b8' }}
          iconType="plainline"
          iconSize={14}
        />
        <Line
          type="monotone"
          dataKey="set1"
          name="Set 1"
          stroke="#a3e635"
          strokeWidth={2.5}
          dot={{ fill: '#a3e635', r: 3.5 }}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="set2"
          name="Set 2"
          stroke="#38bdf8"
          strokeWidth={2.5}
          dot={{ fill: '#38bdf8', r: 3.5 }}
          connectNulls={false}
        />
        <Line
          type="monotone"
          dataKey="set3"
          name="Set 3"
          stroke="#fbbf24"
          strokeWidth={2.5}
          dot={{ fill: '#fbbf24', r: 3.5 }}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Total training volume per session. */
export function SessionVolumeChart({ data }: { data: VolumePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="date" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} />
        <Tooltip content={<ChartTooltip unit="kg" />} cursor={{ fill: '#a3e635', fillOpacity: 0.08 }} />        <Bar dataKey="volume" name="Volume" fill="#a3e635" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Total repetitions per session. */
export function SessionRepsChart({ data }: { data: VolumePoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
        <XAxis dataKey="date" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} />
        <Tooltip content={<ChartTooltip unit="reps" />} cursor={{ fill: '#a3e635', fillOpacity: 0.08 }} />
        <Bar dataKey="reps" name="Reps" fill="#38bdf8" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
