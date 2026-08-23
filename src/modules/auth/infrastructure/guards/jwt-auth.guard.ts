import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_ALLOW_INACTIVE_KEY } from '../../decorators/allow-inactive.decorator';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const isAllowInactive = this.reflector.getAllAndOverride<boolean>(IS_ALLOW_INACTIVE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const canActivate = await super.canActivate(context);
    if (!canActivate) return false;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!isAllowInactive && user && user.storeId && user.role !== 'SUPER_ADMIN') {
      const store = await this.prisma.store.findUnique({
        where: { id: user.storeId },
        select: { isActive: true }
      });

      if (store && !store.isActive) {
        throw new HttpException('Loja Inativa', HttpStatus.FORBIDDEN);
      }
    }

    return true;
  }
}
