import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isDev = process.env.NODE_ENV === 'development';

  // Handle Prisma known request errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') {
      // Record not found
      res.status(404).json({ error: 'Resource not found' });
      return;
    }
    if (err.code === 'P2002') {
      // Unique constraint violation
      res.status(409).json({ error: 'Resource already exists' });
      return;
    }
  }

  // Handle Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Invalid data provided' });
    return;
  }

  const statusCode = err.statusCode ?? 500;
  const message =
    statusCode < 500
      ? err.message
      : isDev
        ? err.message
        : 'An unexpected error occurred';

  res.status(statusCode).json({
    error: message,
    ...(isDev && statusCode >= 500 ? { stack: err.stack } : {}),
  });
}

/** Helper to create errors with an HTTP status code attached */
export function createError(message: string, statusCode: number): AppError {
  const err: AppError = new Error(message);
  err.statusCode = statusCode;
  return err;
}
