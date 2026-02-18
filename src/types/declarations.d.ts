/**
 * Tip tanımı olmayan paketler için manuel deklarasyonlar.
 *
 * Bazı npm paketlerinin @types/... paketi yoktur.
 * Bu dosyayla TypeScript'e "bu modül var, güven bana" diyoruz.
 */

declare module 'playwright-extra-plugin-stealth' {
  import type { PuppeteerExtraPlugin } from 'playwright-extra';

  interface StealthPluginOptions {
    enabledEvasions?: Set<string>;
  }

  function StealthPlugin(options?: StealthPluginOptions): PuppeteerExtraPlugin;
  export default StealthPlugin;
}
