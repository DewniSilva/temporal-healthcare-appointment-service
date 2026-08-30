import type { Server } from 'node:http';
import { createApp } from './app';
import { getEnv } from '../shared/config/env';
import { connectTemporal, closeTemporal } from './temporal/client';
import { ensureReconciliationSchedule } from './temporal/reconciliationSchedule';
import { connectRedis, closeRedis } from './redis/client';
import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/logging/logger';
import { shutdownTelemetry } from '../shared/observability/telemetry';

async function main(): Promise<void> {
  const env = getEnv();
  await prisma.$connect();
  await connectTemporal();
  await ensureReconciliationSchedule();
  await connectRedis();
  const server = createApp().listen(env.PORT, () => logger.info({ event: 'backend_started', port: env.PORT }));
  installShutdown(server);
}

function installShutdown(server: Server): void {
  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ event: 'backend_shutdown_started', signal });
    server.close(async () => {
      await Promise.allSettled([prisma.$disconnect(), closeTemporal(), closeRedis(), shutdownTelemetry()]);
      logger.info({ event: 'backend_stopped' });
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(async (error) => {
  logger.fatal({ event: 'backend_fatal', error });
  await Promise.allSettled([prisma.$disconnect(), closeTemporal(), closeRedis(), shutdownTelemetry()]);
  process.exitCode = 1;
});
