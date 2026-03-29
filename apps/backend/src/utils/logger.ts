/**
 * Structured Logger — Pino tabanlı merkezi log sistemi.
 *
 * Neden Pino?
 *   - JSON-native: Production'da makine-okunabilir log (ELK, Datadog, Loki)
 *   - 5x hızlı: Winston'a göre benchmark farkı çok büyük
 *   - Async transport: Log yazma ana thread'i bloklamaz
 *   - Child logger: Her modüle context ekleyebilirsin
 *
 * Nasıl çalışır?
 *   - NODE_ENV=production → JSON output (tek satır, makine parse eder)
 *   - NODE_ENV !== production → pino-pretty (renkli, insan-okunabilir)
 *   - LOG_LEVEL env ile filtreleme: 'debug' | 'info' | 'warn' | 'error'
 *
 * Custom level: "success" (35)
 *   Pino'da success yok. Biz INFO (30) ile WARN (40) arasına 35 olarak tanımlıyoruz.
 *   Böylece mevcut `logger.success(...)` çağrıları bozulmaz.
 *
 * Kullanım:
 *   import { logger } from '@/utils/logger';
 *
 *   logger.info('mesaj');                          // basit
 *   logger.info({ keyword: 'react' }, 'mesaj');    // context ile
 *
 *   const child = createChildLogger('scraper');
 *   child.info('job bulundu');  // {"module":"scraper", "msg":"job bulundu"}
 */

import pino from 'pino';

// ═══════════════════════════════════════════
// LOG LEVEL CONFIG
// ═══════════════════════════════════════════

/**
 * Geçerli log level'ları.
 * Dışarıdan gelen LOG_LEVEL değerini validate etmek için kullanılır.
 */
const VALID_LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
type LogLevel = (typeof VALID_LOG_LEVELS)[number];

/**
 * Environment'tan gelen LOG_LEVEL'ı validate eder.
 * Geçersizse default olarak 'info' döner.
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
 * Pino logger instance — uygulamanın tek log kaynağı.
 *
 * Custom levels:
 *   success: 35 (info=30 ile warn=40 arası)
 *
 * Transport:
 *   Production → stdout JSON (varsayılan, en hızlı)
 *   Development → pino-pretty (renkli, readable)
 */
const pinoInstance = pino({
  level: resolveLogLevel(),

  // Custom level: success (info ile warn arasında)
  customLevels: {
    success: 35,
  },

  // Timestamp'i ISO 8601 formatında yaz (Elasticsearch uyumlu)
  timestamp: pino.stdTimeFunctions.isoTime,

  // Development'ta pino-pretty kullan
  transport: isProduction
    ? undefined // Production: raw JSON → stdout (en yüksek performans)
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss.l',
          ignore: 'pid,hostname',
          // Custom level'lara renk ve label ata
          customLevels: 'success:35',
          customColors: 'success:green',
          useOnlyCustomProps: false,
        },
      },
});

// ═══════════════════════════════════════════
// PUBLIC API — Eski logger interface'ini korur
// ═══════════════════════════════════════════

/**
 * Pino'nun `customLevels` ile eklediğimiz "success" metodunu
 * TypeScript'e tanıtmak için tip genişletmesi.
 */
type PinoWithSuccess = typeof pinoInstance & {
  success: (objOrMsg: Record<string, unknown> | string, msg?: string) => void;
};

/**
 * Eski logger API'si ile uyumlu wrapper.
 *
 * Eski kullanım:
 *   logger.info('mesaj', { key: 'value' });
 *
 * Pino'nun native API'si:
 *   logger.info({ key: 'value' }, 'mesaj');  // ← object ÖNCE gelir!
 *
 * Bu wrapper her iki kullanımı da destekler ama
 * eski çağrıları (msg, data?) pino formatına (data, msg) çevirir.
 *
 * Neden böyle? Tüm 50+ logger çağrısını tek seferde değiştirmek riskli.
 * Gradual migration: önce wrapper ile geçiş, sonra native API'ye taşınır.
 */
function wrapLogMethod(
  method: (obj: Record<string, unknown>, msg?: string) => void,
): (msgOrObj: string | Record<string, unknown>, dataOrMsg?: Record<string, unknown> | string) => void {
  return (msgOrObj, dataOrMsg?) => {
    if (typeof msgOrObj === 'string') {
      // Eski format: logger.info('mesaj', { key: 'val' })
      if (dataOrMsg && typeof dataOrMsg === 'object') {
        method(dataOrMsg, msgOrObj);
      } else {
        method({}, msgOrObj);
      }
    } else {
      // Pino native format: logger.info({ key: 'val' }, 'mesaj')
      method(msgOrObj, dataOrMsg as string);
    }
  };
}

const typedPino = pinoInstance as PinoWithSuccess;

/**
 * Ana logger — tüm modüller bu objeyi import eder.
 *
 * Eski interface korunuyor:
 *   logger.info('mesaj')
 *   logger.info('mesaj', { key: 'value' })
 *   logger.success('tamamlandı', { count: 5 })
 *
 * Ayrıca pino native format da çalışır:
 *   logger.info({ key: 'value' }, 'mesaj')
 */
export const logger = {
  info: wrapLogMethod(typedPino.info.bind(typedPino)),
  warn: wrapLogMethod(typedPino.warn.bind(typedPino)),
  error: wrapLogMethod(typedPino.error.bind(typedPino)),
  success: wrapLogMethod(typedPino.success.bind(typedPino)),
};

// ═══════════════════════════════════════════
// CHILD LOGGER — Modül bazlı context
// ═══════════════════════════════════════════

/**
 * Modüle özel child logger oluşturur.
 *
 * Her log otomatik olarak `module` field'ı taşır:
 *   const log = createChildLogger('scraper');
 *   log.info('job bulundu');
 *   // → {"module":"scraper","msg":"job bulundu","level":30}
 *
 * @param moduleName Modül adı (scraper, audit, parser, matcher)
 * @returns Wrapper logger objesi (eski API uyumlu)
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
 * Ham pino instance — NestJS Logger adapter'ı veya
 * advanced kullanım için (stream, serializers vb.)
 */
export const pinoLogger = pinoInstance;
