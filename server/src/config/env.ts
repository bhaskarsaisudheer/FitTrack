import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required environment variable "${name}". Copy server/.env.example to server/.env and set it.`,
    );
  }
  return value.trim();
}

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable "${name}" must be an integer.`);
  }
  return parsed;
}

/**
 * Parses the CORS_ORIGIN value into a list of allowed origins.
 * `*` allows every origin (fine locally, avoid in production).
 */
function parseOrigins(raw: string): string[] | '*' {
  const list = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (list.length === 0) return [];
  if (list.includes('*')) return '*';
  return list;
}

export const config = {
  port: integer('PORT', 5000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction: process.env.NODE_ENV === 'production',

  dbHost: required('DB_HOST', '127.0.0.1'),
  dbPort: integer('DB_PORT', 3306),
  dbUser: required('DB_USER', 'root'),
  dbPassword: process.env.DB_PASSWORD ?? '',
  dbName: required('DB_NAME', 'workout_tracker'),

  corsOrigin: parseOrigins(process.env.CORS_ORIGIN ?? 'http://localhost:5173'),
} as const;
