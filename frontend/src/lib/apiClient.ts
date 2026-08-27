import { env } from './env';
import { authStorage } from './authStorage';
import { ApiError, NetworkError } from './apiError';
import type { ApiErrorBody } from '../types/api';

type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered once by the auth provider so a 401 response can clear the session. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Skip the Authorization header, e.g. for /auth/login. */
  skipAuth?: boolean;
}

interface ParsedErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

async function parseErrorBody(response: Response): Promise<ParsedErrorBody> {
  try {
    const data = (await response.json()) as ApiErrorBody;
    if (data?.error?.code && data?.error?.message) return data.error;
  } catch {
    // Body was not JSON (e.g. an upstream proxy error page); fall through.
  }
  return { code: 'UNKNOWN_ERROR', message: response.statusText || 'Request failed' };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, signal, skipAuth = false } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (idempotencyKey) headers['idempotency-key'] = idempotencyKey;
  if (!skipAuth) {
    const token = authStorage.getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${env.VITE_API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new NetworkError();
  }

  if (response.status === 204) return undefined as T;

  if (!response.ok) {
    const { code, message, details } = await parseErrorBody(response);
    if (response.status === 401 && !skipAuth) unauthorizedHandler?.();
    throw new ApiError(response.status, code, message, details);
  }

  return (await response.json()) as T;
}
