/**
 * Helper functions — used across the scraper.
 *
 * Why a separate file? Single Responsibility: every file should have one job.
 * This file contains only general-purpose utilities.
 *
 * Logger: a Pino-based structured logger — lives in `@/utils/logger`.
 * Re-exported from here for backwards compatibility.
 */

// Re-export logger — keep existing `import { logger } from '@/utils/helpers'` calls working
export { logger } from '@/utils/logger';

/**
 * Waits for a given duration (ms).
 * To look human to LinkedIn we sleep a random amount between requests.
 *
 * @param ms Wait duration (milliseconds)
 * @returns Promise that resolves when the wait is over
 */
export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Produces a random integer between min and max (inclusive).
 * Used to simulate human behavior.
 *
 * @param min Minimum value
 * @param max Maximum value
 * @returns Random integer
 */
export const randomBetween = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;
