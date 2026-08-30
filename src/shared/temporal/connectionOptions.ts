import { readFileSync } from 'node:fs';
import type { TLSConfig } from '@temporalio/client';
import { getEnv } from '../config/env';

export function temporalConnectionSecurity(): { tls: boolean | TLSConfig; apiKey?: string } {
  const env = getEnv();
  if (!env.TEMPORAL_TLS_CLIENT_CERT_PATH) {
    return { tls: Boolean(env.TEMPORAL_API_KEY || env.TEMPORAL_TLS), apiKey: env.TEMPORAL_API_KEY };
  }
  return {
    apiKey: env.TEMPORAL_API_KEY,
    tls: {
      clientCertPair: {
        crt: readFileSync(env.TEMPORAL_TLS_CLIENT_CERT_PATH),
        key: readFileSync(env.TEMPORAL_TLS_CLIENT_KEY_PATH!)
      },
      serverRootCACertificate: env.TEMPORAL_TLS_CA_PATH ? readFileSync(env.TEMPORAL_TLS_CA_PATH) : undefined,
      serverNameOverride: env.TEMPORAL_TLS_SERVER_NAME
    }
  };
}
