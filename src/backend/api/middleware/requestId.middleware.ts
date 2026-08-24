import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const safeRequestId = /^[A-Za-z0-9_-]{8,64}$/;

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && safeRequestId.test(incoming) ? incoming : randomUUID();
  res.setHeader('x-request-id', req.requestId);
  next();
}
