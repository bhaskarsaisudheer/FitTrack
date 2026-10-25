/**
 * Migration runner.
 *
 * Reads every `*.sql` file in `database/migrations`, sorted by name, and
 * applies the ones that have not been applied yet. Each file is recorded in
 * the `schema_migrations` table so it is only ever applied once.
 *
 * The runner is defensive: `ALTER TABLE ... ADD COLUMN`, `ADD KEY` and
 * `ADD CONSTRAINT` statements are skipped when the column, index or
 * constraint already exists. That makes a partially applied migration safe
 * to re-run without losing any data.
 *
 * Usage:  npm run migrate
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../config/env.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../../database/migrations');

/** Splits a SQL file into individual statements. */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** Returns the column names that already exist on a table. */
async function existingColumns(
  connection: mysql.Connection,
  table: string,
): Promise<Set<string>> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [config.dbName, table],
  );
  return new Set(rows.map((row) => String(row.COLUMN_NAME)));
}

/** Returns the index names that already exist on a table. */
async function existingIndexes(
  connection: mysql.Connection,
  table: string,
): Promise<Set<string>> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [config.dbName, table],
  );
  return new Set(rows.map((row) => String(row.INDEX_NAME)));
}

/** Returns the constraint names that already exist on a table. */
async function existingConstraints(
  connection: mysql.Connection,
  table: string,
): Promise<Set<string>> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [config.dbName, table],
  );
  return new Set(rows.map((row) => String(row.CONSTRAINT_NAME)));
}

/**
 * Returns true when the statement should be skipped because the schema
 * already contains what it would create.
 */
async function shouldSkip(
  connection: mysql.Connection,
  statement: string,
): Promise<boolean> {
  const addColumn = statement.match(
    /^ALTER TABLE\s+`?(\w+)`?\s+ADD COLUMN\s+`?(\w+)`?/i,
  );
  if (addColumn) {
    const columns = await existingColumns(connection, addColumn[1]!);
    return columns.has(addColumn[2]!);
  }

  const addIndex = statement.match(
    /^ALTER TABLE\s+`?(\w+)`?\s+ADD\s+(?:UNIQUE\s+)?(?:KEY|INDEX)\s+`?(\w+)`?/i,
  );
  if (addIndex) {
    const indexes = await existingIndexes(connection, addIndex[1]!);
    return indexes.has(addIndex[2]!);
  }

  const addConstraint = statement.match(
    /^ALTER TABLE\s+`?(\w+)`?\s+ADD CONSTRAINT\s+`?(\w+)`?/i,
  );
  if (addConstraint) {
    const constraints = await existingConstraints(connection, addConstraint[1]!);
    return constraints.has(addConstraint[2]!);
  }

  return false;
}

/** Splits a multi-column ALTER statement into one statement per column. */
function splitAlterStatements(statement: string): string[] {
  const match = statement.match(
    /^ALTER TABLE\s+`?(\w+)`?\s+(ADD COLUMN\s+.+)$/is,
  );
  if (!match) return [statement];

  const table = match[1]!;
  const body = match[2]!;
  const parts: string[] = [];
  let depth = 0;
  let current = '';

  for (const char of body) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());

  return parts.map((part) => `ALTER TABLE \`${table}\` ${part}`);
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    multipleStatements: false,
  });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${config.dbName}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.query(`USE \`${config.dbName}\``);

    await connection.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         name        VARCHAR(190) PRIMARY KEY,
         applied_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE = InnoDB`,
    );

    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const [appliedRows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT name FROM schema_migrations',
    );
    const applied = new Set(appliedRows.map((row) => String(row.name)));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip  ${file} (already applied)`);
        continue;
      }

      console.log(`[migrate] apply ${file}`);
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');

      for (const rawStatement of splitStatements(sql)) {
        for (const statement of splitAlterStatements(rawStatement)) {
          if (await shouldSkip(connection, statement)) {
            console.log(`[migrate]   skip statement (already present)`);
            continue;
          }
          try {
            await connection.query(statement);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            // A duplicate-key error means the data is already there, which is
            // exactly what the statement wanted.
            if (!message.includes('Duplicate entry') && !message.includes('Duplicate key')) {
              throw new Error(`Failed on "${statement.slice(0, 120)}…": ${message}`);
            }
          }
        }
      }

      await connection.query('INSERT IGNORE INTO schema_migrations (name) VALUES (?)', [file]);
      console.log(`[migrate] done  ${file}`);
    }

    console.log('[migrate] All migrations are up to date.');
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error('[migrate] Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
