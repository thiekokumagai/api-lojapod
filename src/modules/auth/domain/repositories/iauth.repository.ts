import { Role } from '@prisma/client';

export interface AuthUserRecord {
  id: string;
  name?: string | null;
  email: string;
  password: string;
  role: Role;
  permissions: string[];
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
  /**
   * Lê o valor guardado, aplica `mutate` e grava só se ninguém mudou nesse meio tempo
   * (compare-and-swap, sem migration). `mutate` devolve null para abortar; '' grava null.
   * - 'rotated': gravou.
   * - 'rejected': `mutate` abortou (token não vale mais) ou o usuário não existe.
   * - 'conflict': outra gravação ganhou todas as tentativas. Nada foi gravado e o token continua
   *   válido: quem chama deve responder erro TEMPORÁRIO (5xx/409), nunca "token inválido".
   */
  abstract rotateRefreshToken(
    userId: string,
    mutate: (stored: string | null) => string | null,
  ): Promise<RotateRefreshResult>;
}

export type RotateRefreshResult = 'rotated' | 'rejected' | 'conflict';
