/**
 * Auth Constants — JWT secret, cookie settings, expiry constants.
 */

export const AUTH_COOKIE_NAME = 'auth_token';
/** 7 days — same as JWT expiry + cookie maxAge */
export const AUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Forgot-password reset token expiry — 1 hour */
export const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000;
/** bcrypt rounds — 10 (~10ms) is enough for production */
export const BCRYPT_ROUNDS = 10;

/**
 * Reads the JWT secret at runtime — fail-fast if env is missing at startup.
 * JWT_SECRET must be defined in .env.example.
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
