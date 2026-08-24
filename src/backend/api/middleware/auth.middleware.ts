import type { NextFunction, Request, Response } from 'express';
import { verifyToken, type AuthenticatedUser } from '../../auth/auth.service';
import { AppError } from '../errors';

declare global {
  namespace Express {
    interface Request { auth?: AuthenticatedUser; requestId: string; }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header?.startsWith('Bearer ')) return next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'A Bearer token is required.'));
  try {
    req.auth = verifyToken(header.slice(7));
    next();
  } catch (error) {
    next(error);
  }
}
