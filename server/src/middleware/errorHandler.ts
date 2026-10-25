import type { NextFunction, Request, Response } from 'express';
import { config } from '../config/env.js';
import { ApiError } from './errors.js';

interface MySqlError extends Error {
  code?: string;
  errno?: number;
  sqlMessage?: string;
}

/** Maps MySQL driver errors onto meaningful HTTP responses. */
function fromDatabaseError(error: MySqlError): ApiError | null {
  switch (error.code) {
    case 'ER_DUP_ENTRY':
      return new ApiError(409, 'That record already exists.', 'duplicate');
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
      return ApiError.badRequest('Referenced record does not exist.');
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return new ApiError(
        409,
        'This record is used by other records and cannot be deleted.',
        'in_use',
      );
    case 'ER_DATA_TOO_LONG':
      return ApiError.badRequest('One of the values is too long for its field.');
    case 'ECONNREFUSED':
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ER_CON_COUNT_ERROR':
      return new ApiError(503, 'The database is unavailable right now.', 'db_unavailable');
    default:
      return null;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: 'not_found', message: `No route matches ${req.method} ${req.originalUrl}` },
  });
}

/**
 * Catches a malformed JSON body. Express' body parser raises a
 * SyntaxError carrying a `body` property for these cases.
 */
function isMalformedJson(error: unknown): error is SyntaxError & { body: unknown } {
  return (
    error instanceof SyntaxError &&
    'body' in error &&
    typeof (error as { status?: unknown }).status === 'number'
  );
}

/**
 * Terminal error handler. Translates known error shapes into a consistent
 * JSON body and never leaks internals such as SQL or stack traces in
 * production.
 */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (error instanceof ApiError) {
    res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
    return;
  }

  const dbError = error as MySqlError;
  const mapped = dbError && typeof dbError === 'object' ? fromDatabaseError(dbError) : null;
  if (mapped) {
    res.status(mapped.status).json({
      error: { code: mapped.code, message: mapped.message, details: mapped.details },
    });
    return;
  }

  if (isMalformedJson(error)) {
    res.status(400).json({
      error: { code: 'bad_request', message: 'The request body is not valid JSON.' },
    });
    return;
  }

  // Log the real cause for the developer, but keep the response generic.
  console.error('[fittrack] Unhandled error:', error);

  res.status(500).json({
    error: {
      code: 'internal_error',
      message: 'Something went wrong on the server.',
      ...(config.isProduction
        ? {}
        : { detail: error instanceof Error ? error.message : String(error) }),
    },
  });
}
