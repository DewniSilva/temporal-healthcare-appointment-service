import { describe, expect, it } from 'vitest';
import { normalizeRoute } from '../src/backend/api/middleware/httpMetrics.middleware';

describe('HTTP metric route normalization', () => {
  it('removes identifiers while retaining operation names', () => {
    expect(normalizeRoute('/appointments/apt-secret-value/confirm')).toBe('/appointments/:appointmentId/confirm');
    expect(normalizeRoute('/doctors/doctor-001/availability/private-row-id')).toBe('/doctors/:doctorId/availability/:itemId');
    expect(normalizeRoute('/clinic-closures/closure-123')).toBe('/clinic-closures/:itemId');
  });
});
