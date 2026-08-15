import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
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

    const canActivate = await super.canActivate(context);
    if (!canActivate) return false;

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    // Se a rota for de pagamento (para gerar Pix), não bloqueamos
    if (req.route?.path?.includes('/subscriptions/current-invoice')) {
      return true;
    }

    if (user && user.storeId && user.role !== 'SUPER_ADMIN') {
      const store = await this.prisma.store.findUnique({
        where: { id: user.storeId },
        select: { subscriptionExpiresAt: true, isActive: true }
      });

      if (store) {
        if (!store.isActive) {
          throw new HttpException('Assinatura Inativa', HttpStatus.PAYMENT_REQUIRED);
        }
        if (store.subscriptionExpiresAt && new Date(store.subscriptionExpiresAt) < new Date()) {
          throw new HttpException('Assinatura Expirada', HttpStatus.PAYMENT_REQUIRED);
        }
      }
    }

    return true;
  }
}
