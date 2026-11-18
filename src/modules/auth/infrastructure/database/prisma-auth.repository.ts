import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  AuthUserRecord,
  IAuthRepository,
  RotateRefreshResult,
} from '../../domain/repositories/iauth.repository';

@Injectable()
export class PrismaAuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        permissions: true,
        storeId: true,
        refreshToken: true,
      },
    });
  }

  async findById(id: string): Promise<AuthUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        permissions: true,
        storeId: true,
        refreshToken: true,
      },
    });
  }

  async updateRefreshToken(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: refreshTokenHash },
    });
  }

  async rotateRefreshToken(
    userId: string,
    mutate: (stored: string | null) => string | null,
  ): Promise<RotateRefreshResult> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { refreshToken: true },
      });
      if (!user) return 'rejected';

      const next = mutate(user.refreshToken);
      if (next === null) return 'rejected';

      const { count } = await this.prisma.user.updateMany({
        where: { id: userId, refreshToken: user.refreshToken },
        data: { refreshToken: next || null },
      });
      if (count === 1) return 'rotated';
    }
    return 'conflict';
  }
}
