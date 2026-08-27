import { apiRequest } from '../../lib/apiClient';
import type { LoginResponse } from '../../types/api';

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    skipAuth: true
  });
}
