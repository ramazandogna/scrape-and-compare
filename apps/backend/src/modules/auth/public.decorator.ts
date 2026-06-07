import { SetMetadata } from '@nestjs/common';

// ═══════════════════════════════════════════
// @Public() — marks endpoints that don't require auth
// ═══════════════════════════════════════════
// AuthGuard runs globally; handlers decorated with @Public()
// are bypassed by the guard.

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
