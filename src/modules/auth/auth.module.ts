import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './infrastructure/controllers/auth.controller';
import { JwtAuthGuard } from './infrastructure/guards/jwt-auth.guard';
import { JwtStrategy } from './infrastructure/strategies/jwt.strategy';
import { JwtRefreshStrategy } from './infrastructure/strategies/jwt-refresh.strategy';
import { IAuthRepository } from './domain/repositories/iauth.repository';
import { PrismaAuthRepository } from './infrastructure/database/prisma-auth.repository';
import { LoginUseCase } from './domain/use-cases/login.use-case';
import { RefreshTokenUseCase } from './domain/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './domain/use-cases/logout.use-case';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    RefreshTokenUseCase,
    LogoutUseCase,
    JwtAuthGuard,
    JwtStrategy,
    JwtRefreshStrategy,
    {
      provide: IAuthRepository,
      useClass: PrismaAuthRepository,
    },
  ],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
