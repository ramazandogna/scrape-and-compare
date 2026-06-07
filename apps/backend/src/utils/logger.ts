/**
 * Structured Logger — central log system based on Pino.
 *
 * Why Pino?
 *   - JSON-native: machine-readable logs in production (ELK, Datadog, Loki)
 *   - 5x faster: huge benchmark gap over Winston
 *   - Async transport: log writes don't block the main thread
 *   - Child logger: add context per module
 *
 * How it works:
 *   - NODE_ENV=production → JSON output (single line, machine-parsable)
 *   - NODE_ENV !== production → pino-pretty (colored, human-readable)
 *   - LOG_LEVEL env filter: 'debug' | 'info' | 'warn' | 'error'
 *
 * Custom level: "success" (35)
 *   Pino doesn't ship a success level. We define it as 35, between INFO (30) and WARN (40).
 *   This keeps existing `logger.success(...)` calls working.
 *
 * Usage:
 *   import { logger } from '@/utils/logger';
 *
 *   logger.info('message');                          // simple
 *   logger.info({ keyword: 'react' }, 'message');    // with context
 *
 *   const child = createChildLogger('scraper');
 *   child.info('job found');  // {"module":"scraper", "msg":"job found"}
 */

import pino from 'pino';

// ═══════════════════════════════════════════
// LOG LEVEL CONFIG
// ═══════════════════════════════════════════

/**
 * Valid log levels.
 * Used to validate the LOG_LEVEL value coming from outside.
 */
const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

/**
 * Validates the LOG_LEVEL coming from the environment.
 * Falls back to 'info' when invalid.
 */
function resolveLogLevel(): LogLevel {
  const envLevel = process.env['LOG_LEVEL']?.toLowerCase();
  if (envLevel && VALID_LOG_LEVELS.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }
  return 'info';
}

// ═══════════════════════════════════════════
// PINO INSTANCE
// ═══════════════════════════════════════════

const isProduction = process.env['NODE_ENV'] === 'production';

/**
 * Pino logger instance — the single log sink for the application.
 *
 * Custom levels:
 *   success: 35 (between info=30 and warn=40)
 *
 * Transport:
 *   Production → stdout JSON (default, fastest)
 *   Development → pino-pretty (colored, readable)
 */
const pinoInstance = pino({
  level: resolveLogLevel(),

  // Custom level: success (between info and warn)
  customLevels: {
    success: 35,
  },

  // Write timestamps in ISO 8601 format (Elasticsearch compatible)
  timestamp: pino.stdTimeFunctions.isoTime,

  // Use pino-pretty in development
  transport: isProduction
    ? undefined // Production: raw JSON → stdout (max performance)
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          // Assign color and label to custom levels
          customLevels: 'success:35',
          customColors: 'success:green',
          useOnlyCustomProps: false,
        },
      },
});

// ═══════════════════════════════════════════
// PUBLIC API — preserves the old logger interface
// ═══════════════════════════════════════════

/**
 * Type extension that exposes the "success" method we added via Pino's
 * `customLevels` to TypeScript.
 */
type PinoWithSuccess = typeof pinoInstance & {
  success: (objOrMsg: Record<string, unknown> | string, msg?: string) => void;
};

/**
 * Wrapper compatible with the old logger API.
 *
 * Old usage:
 *   logger.info('message', { key: 'value' });
 *
 * Pino's native API:
 *   logger.info({ key: 'value' }, 'message');  // ← object comes FIRST!
 *
 * This wrapper supports both forms but converts old calls (msg, data?)
 * into pino's format (data, msg).
 *
 * Why this way? Changing all 50+ logger calls in one go is risky.
 * Gradual migration: ship the wrapper first, then move to the native API.
 */
function wrapLogMethod(
  method: (obj: Record<string, unknown>, msg?: string) => void,
): (msgOrObj: string | Record<string, unknown>, dataOrMsg?: Record<string, unknown> | string) => void {
  return (msgOrObj, dataOrMsg?) => {
    if (typeof msgOrObj === 'string') {
      // Old format: logger.info('message', { key: 'val' })
      if (dataOrMsg && typeof dataOrMsg === 'object') {
        method(dataOrMsg, msgOrObj);
      } else {
        method({}, msgOrObj);
      }
    } else {
      // Pino native format: logger.info({ key: 'val' }, 'message')
      method(msgOrObj, dataOrMsg as string);
    }
  };
}

const typedPino = pinoInstance as PinoWithSuccess;

/**
 * Main logger — imported by every module.
 *
 * Old interface is preserved:
 *   logger.info('message')
 *   logger.info('message', { key: 'value' })
 *   logger.success('done', { count: 5 })
 *
 * Pino native format also works:
 *   logger.info({ key: 'value' }, 'message')
 */
export const logger = {
  info: wrapLogMethod(typedPino.info.bind(typedPino)),
  warn: wrapLogMethod(typedPino.warn.bind(typedPino)),
  error: wrapLogMethod(typedPino.error.bind(typedPino)),
  success: wrapLogMethod(typedPino.success.bind(typedPino)),
};

// ═══════════════════════════════════════════
// CHILD LOGGER — per-module context
// ═══════════════════════════════════════════

/**
 * Creates a module-scoped child logger.
 *
 * Every log automatically carries a `module` field:
 *   const log = createChildLogger('scraper');
 *   log.info('job found');
 *   // → {"module":"scraper","msg":"job found","level":30}
 *
 * @param moduleName Module name (scraper, audit, parser, matcher)
 * @returns Wrapper logger object (compatible with the old API)
 */
export function createChildLogger(moduleName: string) {
  const child = pinoInstance.child({ module: moduleName }) as PinoWithSuccess;

  return {
    info: wrapLogMethod(child.info.bind(child)),
    warn: wrapLogMethod(child.warn.bind(child)),
    error: wrapLogMethod(child.error.bind(child)),
    success: wrapLogMethod(child.success.bind(child)),
  };
}

/**
 * Raw pino instance — for the NestJS Logger adapter or
 * advanced usage (streams, serializers, etc.)
 */
export const pinoLogger = pinoInstance;
