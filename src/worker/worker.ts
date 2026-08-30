import { NativeConnection, Runtime, Worker } from '@temporalio/worker';
import { OpenTelemetryActivityInboundInterceptor, OpenTelemetryActivityOutboundInterceptor } from '@temporalio/interceptors-opentelemetry';
import { appointmentActivities } from './activities/appointment.activities';
import { reservationActivities } from './activities/reservation.activities';
import { reminderActivities } from './activities/reminder.activities';
import { reconciliationActivities } from './activities/reconciliation.activities';
import { getEnv } from '../shared/config/env';
import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/logging/logger';
import { temporalConnectionSecurity } from '../shared/temporal/connectionOptions';
import { shutdownTelemetry } from '../shared/observability/telemetry';
import { recordReconciliationFailure } from '../shared/observability/metrics';

async function main(): Promise<void> {
  const env = getEnv();
  if (env.METRICS_ENABLED) {
    Runtime.install({ telemetryOptions: { metrics: { prometheus: { bindAddress: `${env.METRICS_HOST}:${env.TEMPORAL_METRICS_PORT}`, countersTotalSuffix: true, useSecondsForDurations: true } } } });
  }
  let connection: NativeConnection | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      connection = await NativeConnection.connect({
        address: env.TEMPORAL_ADDRESS,
        ...temporalConnectionSecurity()
      });
      break;
    } catch (error) {
      lastError = error;
      logger.warn({ event: 'temporal_worker_connection_retry', attempt });
      await new Promise((resolve) => setTimeout(resolve, Math.min(attempt * 1_000, 5_000)));
    }
  }
  if (!connection) throw lastError;

  const worker = await Worker.create({
    connection,
    namespace: env.TEMPORAL_NAMESPACE,
    taskQueue: env.TEMPORAL_TASK_QUEUE,
    workflowsPath: require.resolve('./workflows'),
    activities: { ...appointmentActivities, ...reservationActivities, ...reminderActivities, ...reconciliationActivities },
    interceptors: {
      activity: [(context) => {
        const tracingInbound = new OpenTelemetryActivityInboundInterceptor(context);
        return {
          inbound: {
            execute: (input, next) => tracingInbound.execute(input, async (tracedInput) => {
              try {
                return await next(tracedInput);
              } catch (error) {
                if (context.info.workflowType === 'reconciliationWorkflow') {
                  recordReconciliationFailure(context.info.activityType);
                }
                throw error;
              }
            })
          },
          outbound: new OpenTelemetryActivityOutboundInterceptor(context)
        };
      }]
    },
    maxConcurrentActivityTaskExecutions: 20,
    maxConcurrentWorkflowTaskExecutions: 50
  });
  logger.info({ event: 'worker_started', taskQueue: env.TEMPORAL_TASK_QUEUE });
  try {
    await worker.run(); // SDK handles SIGINT/SIGTERM and drains in-flight work.
  } finally {
    await connection.close();
    await prisma.$disconnect();
    await shutdownTelemetry();
    logger.info({ event: 'worker_stopped' });
  }
}

main().catch((error) => {
  logger.fatal({ event: 'worker_fatal', error });
  process.exitCode = 1;
});
