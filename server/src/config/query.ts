import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

/**
 * Thin typed wrappers around mysql2.
 *
 * mysql2's promise API is typed with `QueryValues` / `ExecuteValues`, which
 * do not accept a plain `unknown[]`. These helpers accept `unknown[]` and
 * cast at the boundary, so the rest of the codebase gets clean generics and
 * never has to deal with the driver's tuple-union overloads.
 */

/** Anything that can run queries: the pool or a transaction connection. */
export type QueryRunner = Pool | PoolConnection;

/** Values accepted as query parameters. */
export type SqlParam = string | number | boolean | null | Date | Buffer;

/** Parameters as accepted by the helpers below. */
export type SqlParams = readonly SqlParam[];

export interface QueryRows<T> {
  rows: T[];
  fields: unknown[];
}

/** Runs a SELECT and returns the rows. */
export async function queryRows<T extends RowDataPacket>(
  runner: QueryRunner,
  sql: string,
  params: SqlParams = [],
): Promise<T[]> {
  const [rows] = await runner.query<T[]>(sql, params as never);
  return rows;
}

/** Runs a SELECT and returns the first row, or null. */
export async function queryOne<T extends RowDataPacket>(
  runner: QueryRunner,
  sql: string,
  params: SqlParams = [],
): Promise<T | null> {
  const rows = await queryRows<T>(runner, sql, params);
  return rows[0] ?? null;
}

/** Runs an INSERT/UPDATE/DELETE and returns the result header. */
export async function execute(
  runner: QueryRunner,
  sql: string,
  params: SqlParams = [],
): Promise<ResultSetHeader> {
  const [result] = await runner.execute<ResultSetHeader>(sql, params as never);
  return result;
}
