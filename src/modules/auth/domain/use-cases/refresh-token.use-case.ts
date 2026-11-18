import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { IAuthRepository } from '../repositories/iauth.repository';
import {
  matchesRefreshSession,
  rotateRefreshSession,
} from '../utils/refresh-sessions';

@Injectable()
export class RefreshTokenUseCase {
  private readonly logger = new Logger(RefreshTokenUseCase.name);

  constructor(
    private readonly authRepository: IAuthRepository,
    private readonly jwt: JwtService,
  ) {}

  async execute(userId: string, refreshToken: string) {
    const user = await this.authRepository.findById(userId);

    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Acesso negado');
    }

    const tokenMatch = matchesRefreshSession(user.refreshToken, refreshToken);

    if (!tokenMatch) {
      this.logReuse(user.id);
      throw new ForbiddenException('Token inválido');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.storeId,
    );

    // Troca só a sessão deste token; as de outros aparelhos ficam intactas. Se o token foi
    // revogado entre a leitura e a gravação (troca de senha), a rotação é abortada.
    const result = await this.authRepository.rotateRefreshToken(
      user.id,
      (stored) =>
        rotateRefreshSession(stored, refreshToken, tokens.refreshToken),
    );
    if (result === 'conflict') {
      // Disputa de gravação: nada mudou e o token continua válido. Erro temporário (o front
      // mantém a sessão e tenta de novo), nunca 403.
      throw new ConflictException(
        'Sessão em renovação por outra requisição. Tente novamente.',
      );
    }
    if (result === 'rejected') {
      this.logReuse(user.id);
      throw new ForbiddenException('Token inválido');
    }

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        storeId: user.storeId,
        permissions: user.role === 'USER' ? user.permissions : [],
      },
    };
  }

  /**
   * O JWT é autêntico e não expirou (a estratégia já conferiu), mas não corresponde a nenhuma
   * sessão nem carência: foi revogado, ou um token já rotacionado foi repetido fora da carência.
   * Pode ser cópia roubada. Registra sem o token.
   */
  private logReuse(userId: string) {
    this.logger.warn(
      `Refresh token revogado ou reutilizado fora da carência (userId=${userId})`,
    );
  }

  private async generateTokens(
    userId: string,
    email: string,
    role: string,
    storeId?: string | null,
  ) {
    const payload = { sub: userId, email, role, storeId };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti: crypto.randomUUID() },
      {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: '7d',
      },
    );

    return { accessToken, refreshToken };
  }
}
