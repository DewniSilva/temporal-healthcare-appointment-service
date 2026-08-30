import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { getEnv } from '../config/env';

let sdk: NodeSDK | undefined;

export function initializeTelemetry(): void {
  if (sdk) return;
  const env = getEnv();
  if (!env.METRICS_ENABLED && !env.OTEL_ENABLED) return;
  sdk = new NodeSDK({
    serviceName: env.OTEL_SERVICE_NAME,
    metricReaders: env.METRICS_ENABLED ? [new PrometheusExporter({ host: env.METRICS_HOST, port: env.METRICS_PORT })] : [],
    traceExporter: env.OTEL_ENABLED ? new OTLPTraceExporter() : undefined,
    instrumentations: env.OTEL_ENABLED
      ? [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } }), new PrismaInstrumentation()]
      : []
  });
  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}
