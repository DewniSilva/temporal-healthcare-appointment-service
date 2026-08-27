import pino from 'pino';
import { getEnv } from '../config/env';

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', 'token', 'secret', '*.password', '*.token'],
    censor: '[REDACTED]'
  },
  // Without this, `{ error }` with a plain Error object serializes to `{}` —
  // Error's message/stack are non-enumerable, so JSON.stringify drops them.
  serializers: { error: pino.stdSerializers.err, err: pino.stdSerializers.err },
  base: undefined
});
