/**
 * Yardımcı fonksiyonlar — scraper genelinde kullanılır.
 *
 * Neden ayrı dosya? Single Responsibility: her dosyanın tek görevi olmalı.
 * Bu dosya sadece genel amaçlı utility'ler içerir.
 */

/**
 * Belirli bir süre bekler (ms).
 * LinkedIn'e insan gibi görünmek için request'ler arası rastgele bekleriz.
 *
 * @param ms Bekleme süresi (milisaniye)
 * @returns Bekleme bitince resolve olan Promise
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Min-max arasında rastgele bir sayı üretir (inclusive).
 * İnsan davranışını simüle etmek için kullanılır.
 *
 * @param min Minimum değer
 * @param max Maximum değer
 * @returns Rastgele tam sayı
 */
export const randomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Basit console logger — ileride winston/pino ile değiştirilebilir.
 * Her log'a timestamp ekler.
 */
export const logger = {
  info: (message: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },

  warn: (message: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠️  ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },

  error: (message: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },

  success: (message: string, data?: Record<string, unknown>) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`, data ? JSON.stringify(data, null, 2) : '');
  },
};
