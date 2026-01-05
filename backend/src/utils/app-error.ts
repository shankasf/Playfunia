export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  public readonly cause?: unknown;

  constructor(message: string, statusCode = 500, options?: { cause?: unknown; isOperational?: boolean }) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = options?.isOperational ?? true;
    this.cause = options?.cause;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
