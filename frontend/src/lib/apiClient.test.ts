import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, setUnauthorizedHandler } from './apiClient';
import { ApiError, NetworkError } from './apiError';

vi.mock('./authStorage', () => ({
  authStorage: { getToken: vi.fn(() => 'stored-token'), setToken: vi.fn(), clearToken: vi.fn() }
}));

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

describe('apiRequest', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
  });

  it('returns parsed JSON on success and attaches the bearer token', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));

    const result = await apiRequest<{ ok: boolean }>('/health');

    expect(result).toEqual({ ok: true });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBe('Bearer stored-token');
  });

  it('omits the authorization header when skipAuth is set', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(200, { token: 'x' }));

    await apiRequest('/auth/login', { method: 'POST', body: { a: 1 }, skipAuth: true });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.authorization).toBeUndefined();
  });

  it('sends the idempotency-key header when provided', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse(202, { status: 'STARTED' }));

    await apiRequest('/appointments', { method: 'POST', body: {}, idempotencyKey: 'key-123' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['idempotency-key']).toBe('key-123');
  });

  it('throws a normalized ApiError for a structured error body', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse(403, { error: { code: 'FORBIDDEN', message: 'You cannot access this appointment.' } })
    );

    await expect(apiRequest('/appointments/abc')).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
      message: 'You cannot access this appointment.'
    });
  });

  it('falls back to a generic error when the body is not JSON', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }));

    const error = await apiRequest('/appointments/abc').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).code).toBe('UNKNOWN_ERROR');
  });

  it('invokes the registered unauthorized handler on a 401', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: { code: 'INVALID_TOKEN', message: 'Authentication token is invalid or expired.' } })
    );
    const handler = vi.fn();
    setUnauthorizedHandler(handler);

    await expect(apiRequest('/appointments/abc')).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('wraps a network failure as NetworkError', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(apiRequest('/health')).rejects.toBeInstanceOf(NetworkError);
  });

  it('maps 429 and 503 statuses onto their ApiError helper flags', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } })
    );
    const rateLimited = (await apiRequest('/auth/login', { skipAuth: true }).catch((e: unknown) => e)) as ApiError;
    expect(rateLimited.isRateLimited).toBe(true);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, { error: { code: 'TEMPORAL_UNAVAILABLE', message: 'Unavailable.' } })
    );
    const unavailable = (await apiRequest('/appointments/abc').catch((e: unknown) => e)) as ApiError;
    expect(unavailable.isServiceUnavailable).toBe(true);
  });
});
