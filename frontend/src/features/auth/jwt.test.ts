import { describe, expect, it } from 'vitest';
import { decodeJwt, isExpired } from './jwt';

function makeToken(payload: Record<string, unknown>): string {
  const base64Url = (input: object) =>
    btoa(JSON.stringify(input)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64Url({ alg: 'HS256', typ: 'JWT' })}.${base64Url(payload)}.signature`;
}

describe('decodeJwt', () => {
  it('decodes a well-formed token payload', () => {
    const token = makeToken({ userId: 'user-1', role: 'PATIENT', patientId: 'patient-001', exp: 9999999999 });
    expect(decodeJwt(token)).toMatchObject({ userId: 'user-1', role: 'PATIENT', patientId: 'patient-001' });
  });

  it('returns null for a malformed token', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt('only.two')).toBeNull();
  });

  it('returns null when required claims are missing', () => {
    const token = makeToken({ role: 'PATIENT' });
    expect(decodeJwt(token)).toBeNull();
  });
});

describe('isExpired', () => {
  it('is true once the current time passes exp', () => {
    const claims = { userId: 'u', role: 'PATIENT' as const, iat: 0, exp: 1000 };
    expect(isExpired(claims, 999)).toBe(false);
    expect(isExpired(claims, 1000)).toBe(true);
    expect(isExpired(claims, 1001)).toBe(true);
  });
});
