/**
 * Manual declarations for packages without type definitions.
 *
 * Some npm packages don't ship an @types/... package.
 * This file tells TypeScript "this module exists, trust me".
 */

declare module 'puppeteer-extra-plugin-stealth' {
  import type { PuppeteerExtraPlugin } from 'playwright-extra';

  interface StealthPluginOptions {
    enabledEvasions?: Set<string>;
  }

  function StealthPlugin(options?: StealthPluginOptions): PuppeteerExtraPlugin;
  export default StealthPlugin;
}
