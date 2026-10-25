import mysql from 'mysql2/promise';
import { config } from './env.js';

/**
 * Shared connection pool. Every query in the app goes through this pool so
 * credentials live in exactly one place and connections are reused.
 */
export const pool = mysql.createPool({
  host: config.dbHost,
  port: config.dbPort,
  user: config.dbUser,
  password: config.dbPassword,
  database: config.dbName,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: ['DATE', 'DATETIME'],
  decimalNumbers: true,
});

/** Verifies the database is reachable. Used by /api/health and on boot. */
export async function checkDatabaseConnection(): Promise<void> {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
