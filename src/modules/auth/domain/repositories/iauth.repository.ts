export interface AuthUserRecord {
  id: string;
  email: string;
  password: string;
  refreshToken: string | null;
}

export abstract class IAuthRepository {
  abstract findByEmail(email: string): Promise<AuthUserRecord | null>;
  abstract findById(id: string): Promise<AuthUserRecord | null>;
  abstract updateRefreshToken(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void>;
}
