import pino from 'pino';
import { getEnv } from '../config/env';

export const logger = pino({
  level: getEnv().LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'password', 'passwordHash', 'token', 'secret', '*.password', '*.token'],
    censor: '[REDACTED]'
  },
  base: undefined
});
