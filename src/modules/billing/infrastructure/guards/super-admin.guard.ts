import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest().user;
    if (user?.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('Acesso exclusivo do Super Admin');
    }
    return true;
  }
}
