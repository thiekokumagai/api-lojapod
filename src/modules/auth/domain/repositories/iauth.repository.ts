import { Role } from '@prisma/client';

export interface AuthUserRecord {
  id: string;
  name?: string | null;
  email: string;
  password: string;
  role: Role;
  storeId?: string | null;
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
