import pino from 'pino';
import { getEnv } from '../config/env';
import { trace } from '@opentelemetry/api';

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', 'token', 'secret', 'apiKey', 'DATABASE_URL', 'REDIS_URL', '*.password', '*.token', '*.secret', '*.apiKey'],
    censor: '[REDACTED]'
  },
  // Without this, `{ error }` with a plain Error object serializes to `{}` —
  // Error's message/stack are non-enumerable, so JSON.stringify drops them.
  serializers: { error: pino.stdSerializers.err, err: pino.stdSerializers.err },
  mixin() {
    const context = trace.getActiveSpan()?.spanContext();
    return context ? { traceId: context.traceId, spanId: context.spanId } : {};
  },
  base: undefined
});
