/** Formatting helpers shared across the screens. */

/** Formats a number with no trailing zeros: 12, 12.5, 12.25. */
export function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

/** Formats a volume figure with thousands separators: 12,450 kg. */
export function formatVolume(value: number): string {
  return `${Math.round(value).toLocaleString()} kg`;
}

/** Parses a `YYYY-MM-DD` string into a local Date at midnight. */
export function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

/**
 * Whether a value is a usable `YYYY-MM-DD` date.
 *
 * A session with no sets has no date, so an empty string has to be
 * handled before it is turned into a date.
 */
export function isValidDate(value: string | null | undefined): boolean {
  if (!value) return false;
  const parts = value.split('-').map(Number);
  if (parts.length !== 3) return false;
  if (parts.some((part) => !Number.isFinite(part))) return false;
  const [year, month, day] = parts;
  if (year < 1000 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  return true;
}

/** Formats a `YYYY-MM-DD` date as e.g. "Mon, 25 Oct 2026". */
export function formatDate(value: string): string {
  // A date that is missing or malformed is shown as a dash rather than
  // as the start of the epoch.
  if (!isValidDate(value)) return '—';

  return parseDate(value).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Formats a `YYYY-MM-DD` date as e.g. "25 Oct". */
export function formatShortDate(value: string): string {
  if (!isValidDate(value)) return '—';
  return parseDate(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Formats a date as a relative label: "Today", "Yesterday", "3 days ago". */
export function formatRelativeDate(value: string): string {
  if (!isValidDate(value)) return '—';

  const target = parseDate(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < -1 && diffDays > -7) return `In ${Math.abs(diffDays)} days`;
  return formatDate(value);
}

/** Returns today's date as `YYYY-MM-DD` in local time. */
export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Returns the current local time as `YYYY-MM-DDTHH:mm`. */
export function nowLocalIso(): string {
  const now = new Date();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  return `${todayIso()}T${hours}:${minutes}`;
}

/** Formats seconds as `M:SS`, e.g. 90 becomes "1:30". */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** Formats a duration in minutes as e.g. "1h 15m". */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes === undefined) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Capitalises the first letter of a string. */
export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
