import type { NextFunction, Request, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ApiError } from './errors.js';

type Source = 'body' | 'query' | 'params';

/**
 * Validates and coerces a request segment against a Zod schema, replacing
 * the raw value with the parsed result so downstream handlers receive
 * well-typed data (numbers as numbers, dates as strings, and so on).
 */
export function validate(schema: ZodType, source: Source = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.') || source,
        message: issue.message,
      }));
      next(ApiError.badRequest('Validation failed.', details));
      return;
    }

    // `req.query` and `req.params` are getter-only in Express 5, so the
    // parsed value is stashed on the request instead of being assigned back.
    if (source === 'body') {
      req.body = result.data;
    } else {
      Object.defineProperty(req, `validated${source[0]?.toUpperCase()}${source.slice(1)}`, {
        value: result.data,
        writable: true,
        configurable: true,
      });
    }

    next();
  };
}

/** Reads a value validated by `validate(..., 'query')`. */
export function validatedQuery<T>(req: Request): T {
  return (req as unknown as Record<string, unknown>).validatedQuery as T;
}

/** Reads a value validated by `validate(..., 'params')`. */
export function validatedParams<T>(req: Request): T {
  return (req as unknown as Record<string, unknown>).validatedParams as T;
}

export function formatZodError(error: ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
}
