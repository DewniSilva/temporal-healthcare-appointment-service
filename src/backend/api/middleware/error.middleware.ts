import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';
import { logger } from '../../../shared/logging/logger';

export const notFound: RequestHandler = (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route not found.'));

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (error instanceof SyntaxError && typeof error === 'object' && 'status' in error && error.status === 400) {
    res.status(400).json({ error: { code: 'MALFORMED_JSON', message: 'Request body contains malformed JSON.' } });
    return;
  }
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.issues.map(({ path, message }) => ({ path, message })) } });
    return;
  }
  if (error instanceof AppError) {
    if (error.status >= 500) logger.error({ event: 'request_failed', requestId: req.requestId, code: error.code, error });
    res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) } });
    return;
  }
  logger.error({ event: 'unexpected_request_error', requestId: req.requestId, error });
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};
