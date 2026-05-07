import { SetMetadata } from '@nestjs/common';

// ═══════════════════════════════════════════
// @Public() — auth gerektirmeyen endpoint'leri işaretler
// ═══════════════════════════════════════════
// AuthGuard global olarak çalışıyor; @Public() decorator'lı handler'lar
// guard tarafından bypass edilir.

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
