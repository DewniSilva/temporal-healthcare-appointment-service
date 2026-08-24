import { NativeConnection, Worker } from '@temporalio/worker';
import { activities } from './activities/appointment.activities';
import { getEnv } from '../shared/config/env';
import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/logging/logger';

async function main(): Promise<void> {
  const env = getEnv();
  let connection: NativeConnection | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      connection = await NativeConnection.connect({ address: env.TEMPORAL_ADDRESS });
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
    activities,
    maxConcurrentActivityTaskExecutions: 20,
    maxConcurrentWorkflowTaskExecutions: 50
  });
  logger.info({ event: 'worker_started', taskQueue: env.TEMPORAL_TASK_QUEUE });
  try {
    await worker.run(); // SDK handles SIGINT/SIGTERM and drains in-flight work.
  } finally {
    await connection.close();
    await prisma.$disconnect();
    logger.info({ event: 'worker_stopped' });
  }
}

main().catch((error) => {
  logger.fatal({ event: 'worker_fatal', error });
  process.exitCode = 1;
});
