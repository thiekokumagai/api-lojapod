import { Injectable, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { IAuthRepository } from '../repositories/iauth.repository';
import {
  compareRefreshToken,
  hashRefreshToken,
} from '../utils/refresh-token-hash';

@Injectable()
export class RefreshTokenUseCase {
  constructor(
    private readonly authRepository: IAuthRepository,
    private readonly jwt: JwtService,
  ) {}

  async execute(userId: string, refreshToken: string) {
    const user = await this.authRepository.findById(userId);

    if (!user || !user.refreshToken) {
      throw new ForbiddenException('Acesso negado');
    }

    const tokenMatch = compareRefreshToken(refreshToken, user.refreshToken);

    if (!tokenMatch) {
      throw new ForbiddenException('Token inválido');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email,
      user.role,
      user.storeId,
    );

    const hash = hashRefreshToken(tokens.refreshToken);
    await this.authRepository.updateRefreshToken(user.id, hash);

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
