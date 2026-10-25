/**
 * Application-level error with an HTTP status code. Anything thrown that is
 * not an ApiError is treated as an unexpected failure and reported as 500.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, message: string, code = 'error', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown): ApiError {
    return new ApiError(400, message, 'bad_request', details);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, message, 'not_found');
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, message, 'conflict');
  }

  static internal(message: string): ApiError {
    return new ApiError(500, message, 'internal_error');
  }
}
