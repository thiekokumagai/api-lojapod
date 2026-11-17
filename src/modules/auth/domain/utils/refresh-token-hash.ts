import * as crypto from 'crypto';

/**
 * Hash seguro para refresh tokens usando SHA-256.
 *
 * O bcrypt só avalia os primeiros 72 bytes. Como JWTs do mesmo usuário
 * compartilham o mesmo payload inicial, refresh tokens distintos podiam
 * colidir no bcrypt. O SHA-256 avalia todo o token.
 */
export function hashRefreshToken(refreshToken: string): string {
  return crypto.createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

/**
 * Comparação em tempo constante para evitar timing attacks.
 * Retorna false se o hash salvo for de outro formato (ex.: hash antigo em bcrypt).
 */
export function compareRefreshToken(
  plain: string,
  hashed: string | null | undefined,
): boolean {
  if (!plain || !hashed) return false;
  const computed = hashRefreshToken(plain);
  const a = Buffer.from(computed, 'utf8');
  const b = Buffer.from(hashed, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}
