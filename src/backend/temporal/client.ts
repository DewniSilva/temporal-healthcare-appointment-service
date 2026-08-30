import { Client, Connection } from '@temporalio/client';
import { getEnv } from '../../shared/config/env';
import { OpenTelemetryWorkflowClientInterceptor } from '@temporalio/interceptors-opentelemetry';
import { temporalConnectionSecurity } from '../../shared/temporal/connectionOptions';

let connection: Connection | undefined;
let client: Client | undefined;

export async function connectTemporal(maxAttempts = 10): Promise<Client> {
  if (client) return client;
  const env = getEnv();
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      connection = await Connection.connect({
        address: env.TEMPORAL_ADDRESS,
        ...temporalConnectionSecurity()
      });
      client = new Client({
        connection,
        namespace: env.TEMPORAL_NAMESPACE,
        interceptors: { workflow: [new OpenTelemetryWorkflowClientInterceptor()] }
      });
      return client;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 1_000, 5_000)));
    }
  }
  throw lastError;
}

export function temporalClient(): Client {
  if (!client) throw new Error('Temporal client has not been initialized');
  return client;
}

export async function closeTemporal(): Promise<void> {
  await connection?.close();
  client = undefined;
  connection = undefined;
}
