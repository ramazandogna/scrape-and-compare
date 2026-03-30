/**
 * ESM Register — SWC compilation + path alias resolution.
 *
 * Tek bir hooks modülü kaydeder (hooks.mjs):
 *   - SWC'nin resolve + load fonksiyonlarını import eder
 *   - resolve'u @/ path alias desteğiyle wrap eder
 *   - load olduğu gibi SWC'ye delege edilir
 *
 * Neden tek modül?
 *   İki ayrı register() çağrısında, ilk register SWC hooks'larını
 *   aktive edince ikinci register'ın modül çözümlemesi SWC'den geçer
 *   ve başarısız olur. Tek modülle bu sorun ortadan kalkar.
 */

import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./hooks.mjs', pathToFileURL('./').toString());
