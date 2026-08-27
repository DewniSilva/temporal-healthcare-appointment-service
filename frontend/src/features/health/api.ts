import { apiRequest } from '../../lib/apiClient';
import type { HealthResponse } from '../../types/api';

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health', { signal, skipAuth: true });
}
