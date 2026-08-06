import { Injectable, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { IAuthRepository } from '../repositories/iauth.repository';

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

    const tokenMatch = await bcrypt.compare(refreshToken, user.refreshToken);

    if (!tokenMatch) {
      throw new ForbiddenException('Token inválido');
    }

    const tokens = await this.generateTokens(user.id, user.email);

    const hash = await bcrypt.hash(tokens.refreshToken, 10);
    await this.authRepository.updateRefreshToken(user.id, hash);

    return tokens;
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_SECRET,
      expiresIn: '15m',
    });

    const refreshToken = await this.jwt.signAsync(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '7d',
    });

    return { accessToken, refreshToken };
  }
}
