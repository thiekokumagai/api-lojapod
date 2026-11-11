import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_ALLOW_INACTIVE_KEY } from '../decorators/allow-inactive.decorator';
import {
  ADMIN_ONLY_KEY,
  PERMISSIONS_KEY,
  WRITE_PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';

import { STAFF_ROLE } from '../../permissions/screen-permissions';
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
  private static storeCache = new Map<string, { store: { id: string; isActive: boolean; subdomain: string }; expiresAt: number }>();
  private static staffCache = new Map<string, { staff: { storeId: string | null; permissions: string[] } | null; expiresAt: number }>();

  /** Remove o usuário do cache de permissões (chamar após editar/excluir). */
  static invalidateStaff(userId: string) {
    JwtAuthGuard.staffCache.delete(userId);
  }

  private async getStaffCached(userId: string) {
    const now = Date.now();
    const cached = JwtAuthGuard.staffCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.staff;
    }

    const staff = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { storeId: true, permissions: true, role: true },
    });

    const value = staff && staff.role === STAFF_ROLE
      ? { storeId: staff.storeId, permissions: staff.permissions }
      : null;

    JwtAuthGuard.staffCache.set(userId, { staff: value, expiresAt: now + 15000 });
    return value;
  }

  /**
   * Funcionários (role USER) só acessam o que suas permissões liberam.
   * ADMIN e SUPER_ADMIN não passam por aqui.
   */
  private async assertStaffAccess(context: ExecutionContext, user: { sub: string; storeId?: string | null }) {
    const targets = [context.getHandler(), context.getClass()];

    const adminOnly = this.reflector.getAllAndOverride<boolean>(ADMIN_ONLY_KEY, targets);
    if (adminOnly) {
      throw new ForbiddenException('Acesso restrito ao administrador da loja');
    }

    const staff = await this.getStaffCached(user.sub);
    if (!staff) {
      // Usuário removido ou perfil alterado: força novo login
      throw new UnauthorizedException('Usuário sem acesso');
    }
    if (!staff.storeId || staff.storeId !== user.storeId) {
      throw new ForbiddenException('Usuário não vinculado a esta loja');
    }

    const req = context.switchToHttp().getRequest();
    const isWrite = !['GET', 'HEAD', 'OPTIONS'].includes(String(req.method).toUpperCase());

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, targets);
    const requiredWrite = isWrite
      ? this.reflector.getAllAndOverride<string[]>(WRITE_PERMISSIONS_KEY, targets)
      : undefined;

    for (const list of [required, requiredWrite]) {
      if (list && list.length > 0 && !list.some((p) => staff.permissions.includes(p))) {
        throw new ForbiddenException('Você não tem permissão para acessar esta área');
      }
    }
  }

  private async getStoreCached(storeId: string) {
    const now = Date.now();
    const cached = JwtAuthGuard.storeCache.get(storeId);
    if (cached && cached.expiresAt > now) {
      return cached.store;
    }

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, isActive: true, subdomain: true },
    });

    if (store) {
      JwtAuthGuard.storeCache.set(storeId, {
        store,
        expiresAt: now + 30000, // 30s TTL
      });
    }

    return store;
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
            const store = await this.getStoreCached(req.user.storeId);
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
      const store = await this.getStoreCached(user.storeId);

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

    if (user && user.role === STAFF_ROLE) {
      await this.assertStaffAccess(context, user);
    }

    return true;
  }
}
