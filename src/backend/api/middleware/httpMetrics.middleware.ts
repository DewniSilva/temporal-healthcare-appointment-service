import type { RequestHandler } from 'express';
import { recordHttp } from '../../../shared/observability/metrics';

export function normalizeRoute(path: string): string {
  const segments = path.split('/').filter(Boolean);
  return '/' + segments.map((segment, index) => {
    if (segments[0] === 'appointments' && index === 1) return ':appointmentId';
    if (segments[0] === 'doctors' && index === 1) return ':doctorId';
    if (segments[0] === 'doctors' && index === 3) return ':itemId';
    if (segments[0] === 'clinic-closures' && index === 1) return ':itemId';
    return segment;
  }).join('/');
}

export const httpMetrics: RequestHandler = (req, res, next) => {
  const started = performance.now();
  res.on('finish', () => recordHttp(req.method, normalizeRoute(req.path), res.statusCode, performance.now() - started));
  next();
};
