import { beforeEach, describe, expect, it, vi } from 'vitest';

const instruments = vi.hoisted(() => new Map<string, { add?: ReturnType<typeof vi.fn>; record?: ReturnType<typeof vi.fn> }>());
vi.mock('@opentelemetry/api', () => ({
  metrics: {
    getMeter: () => ({
      createCounter: (name: string) => {
        const instrument = { add: vi.fn() };
        instruments.set(name, instrument);
        return instrument;
      },
      createHistogram: (name: string) => {
        const instrument = { record: vi.fn() };
        instruments.set(name, instrument);
        return instrument;
      }
    })
  }
}));

import {
  recordAppointmentTransition,
  recordHttp,
  recordRateLimitBlocked,
  recordReminderTransition
} from '../src/shared/observability/metrics';

describe('application metrics', () => {
  beforeEach(() => {
    for (const instrument of instruments.values()) {
      instrument.add?.mockClear();
      instrument.record?.mockClear();
    }
  });

  it('increments the specific appointment transition counter', () => {
    recordAppointmentTransition('BOOKED');
    expect(instruments.get('appointments_booked')?.add).toHaveBeenCalledWith(1);
    expect(instruments.get('appointments_requested')?.add).not.toHaveBeenCalled();
  });

  it('records reminder failures only with bounded reminder type metadata', () => {
    recordReminderTransition('failed', 'UPCOMING_REMINDER');
    expect(instruments.get('reminders_failed')?.add).toHaveBeenCalledWith(1, { reminder_type: 'UPCOMING_REMINDER' });
  });

  it('normalizes HTTP and rate-limit metadata without secrets or identifiers', () => {
    recordHttp('POST', '/appointments/:appointmentId/confirm', 503, 250);
    recordRateLimitBlocked('confirm');
    expect(instruments.get('http_requests')?.add).toHaveBeenCalledWith(1, {
      method: 'POST', route: '/appointments/:appointmentId/confirm', status_class: '5xx'
    });
    expect(instruments.get('rate_limit_blocked')?.add).toHaveBeenCalledWith(1, { policy: 'confirm' });
    expect(JSON.stringify([...instruments.values()].flatMap((item) => item.add?.mock.calls ?? []))).not.toContain('secret');
  });
});
