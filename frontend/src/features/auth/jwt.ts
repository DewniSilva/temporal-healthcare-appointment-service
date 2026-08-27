import type { UserRole } from '../../types/api';

export interface JwtClaims {
  userId: string;
  role: UserRole;
  patientId?: string;
  doctorId?: string;
  iat: number;
  exp: number;
}

function base64UrlDecode(segment: string): string {
  const padLength = Math.ceil(segment.length / 4) * 4;
  const padded = segment
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(padLength, '=');
  return atob(padded);
}

function isJwtClaims(value: unknown): value is JwtClaims {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as JwtClaims).userId === 'string' &&
    typeof (value as JwtClaims).role === 'string' &&
    typeof (value as JwtClaims).exp === 'number'
  );
}

/**
 * Decodes a JWT payload for UI routing/display only. This is not signature
 * verification — the backend remains the sole source of authorization truth.
 */
export function decodeJwt(token: string): JwtClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = JSON.parse(base64UrlDecode(parts[1]));
    return isJwtClaims(json) ? json : null;
  } catch {
    return null;
  }
}

export function isExpired(claims: JwtClaims, nowSeconds = Date.now() / 1000): boolean {
  return claims.exp <= nowSeconds;
}
