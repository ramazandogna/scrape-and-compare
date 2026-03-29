/**
 * Yardımcı fonksiyonlar — scraper genelinde kullanılır.
 *
 * Neden ayrı dosya? Single Responsibility: her dosyanın tek görevi olmalı.
 * Bu dosya sadece genel amaçlı utility'ler içerir.
 *
 * Logger: Pino tabanlı structured logger — `@/utils/logger` dosyasında yaşar.
 * Geriye uyumluluk için buradan re-export edilir.
 */

// Re-export logger — mevcut `import { logger } from '@/utils/helpers'` çağrıları bozulmasın
export { logger } from '@/utils/logger';

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
