import { Injectable, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_ALLOW_INACTIVE_KEY } from '../decorators/allow-inactive.decorator';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { TenantContextService } from '../../../tenant/tenant-context.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private tenantContextService: TenantContextService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      const req = context.switchToHttp().getRequest();
      const authHeader = req?.headers?.authorization;
      if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        try {
          const authenticated = await super.canActivate(context);
          if (authenticated && req.user?.storeId) {
            const store = await this.prisma.store.findUnique({
              where: { id: req.user.storeId },
              select: { id: true, isActive: true, subdomain: true },
            });
            if (store) {
              this.tenantContextService.setTenantContext({
                storeId: store.id,
                isActive: store.isActive,
                subdomain: store.subdomain,
              });
            }
          }
        } catch {
          // Ignora falhas de autenticação em rotas públicas
        }
      }
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

    if (user && user.storeId) {
      const store = await this.prisma.store.findUnique({
        where: { id: user.storeId },
        select: { id: true, isActive: true, subdomain: true },
      });

      if (store) {
        this.tenantContextService.setTenantContext({
          storeId: store.id,
          isActive: store.isActive,
          subdomain: store.subdomain,
        });

        if (!isAllowInactive && user.role !== 'SUPER_ADMIN' && !store.isActive) {
          throw new HttpException('Loja Inativa', HttpStatus.FORBIDDEN);
        }
      }
    }

    return true;
  }
}
