/**
 * Auth Constants — JWT secret, cookie ayarları, expiry sabitleri.
 */

export const AUTH_COOKIE_NAME = 'auth_token';
/** 7 gün — JWT expiry + cookie maxAge ile aynı */
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Forgot-password reset token expiry — 1 saat */
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
/** bcrypt rounds — 10 (~10ms) production için yeterli */
export const BCRYPT_ROUNDS = 10;

/**
 * JWT secret'ı runtime'da okur — startup'ta env yoksa fail-fast.
 * .env.example'da JWT_SECRET tanımlı olmalı.
 */
export function getAuthSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error(
      'JWT_SECRET env variable eksik veya çok kısa (min 32 karakter). .env dosyasını kontrol et.',
    );
  }
  return secret;
}

export function isProduction(): boolean {
  return process.env['NODE_ENV'] === 'production';
}
