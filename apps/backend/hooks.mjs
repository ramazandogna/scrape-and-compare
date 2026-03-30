/**
 * Unified ESM Hooks — SWC compilation + @/ path alias resolution.
 *
 * Bu dosya @swc-node/register/esm'den resolve ve load hook'larını
 * import eder, resolve'u @/ prefix handling ile wrap eder.
 *
 * Tek hooks modülü kullanarak iki ayrı register() çağrısı sorununu önlüyoruz.
 * (İlk register SWC hooks'ları aktive edince ikinci register'ın modül
 * çözümlemesi SWC resolver'ından geçip başarısız oluyordu.)
 */

import { existsSync } from 'node:fs';
import { resolve as resolvePath, join } from 'node:path';
import { pathToFileURL } from 'node:url';

// SWC'nin hook'larını import et — load olduğu gibi kullanılır
export { load } from '@swc-node/register/esm';

// SWC'nin resolve'unu import et — @/ handling ile wrap edeceğiz
import { resolve as swcResolve } from '@swc-node/register/esm';

/**
 * Custom resolve hook — @/ prefix'ini src/ dizinine yönlendirir.
 *
 * @/ ile başlayan specifier'lar için:
 *   1. src/ dizininde .ts, /index.ts, .tsx uzantılarını dener
 *   2. Bulunan dosyanın file:// URL'ini SWC resolve'a geçer
 *   3. SWC file:// URL görünce oxc-resolver'ı atlar, direkt döner
 *
 * Diğer specifier'lar direkt SWC resolve'a yönlendirilir.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const stripped = specifier.slice(2);
    const base = resolvePath(process.cwd(), 'src', stripped);

    const candidates = [
      base + '.ts',
      join(base, 'index.ts'),
      base + '.tsx',
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return swcResolve(pathToFileURL(candidate).href, context, nextResolve);
      }
    }
  }

  return swcResolve(specifier, context, nextResolve);
}
