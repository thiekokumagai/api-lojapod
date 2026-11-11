import { SetMetadata } from '@nestjs/common';
import type { ScreenPermission } from '../../permissions/screen-permissions';

export const PERMISSIONS_KEY = 'requiredPermissions';
export const WRITE_PERMISSIONS_KEY = 'requiredWritePermissions';
export const ADMIN_ONLY_KEY = 'adminOnly';

/**
 * Exige que funcionários (role USER) tenham ao menos UMA das permissões
 * informadas para qualquer método HTTP. ADMIN e SUPER_ADMIN sempre passam.
 * Só tem efeito em rotas protegidas pelo JwtAuthGuard.
 */
export const RequirePermissions = (...permissions: ScreenPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Igual a RequirePermissions, mas só vale para métodos de escrita
 * (POST, PUT, PATCH, DELETE). Leituras (GET) ficam liberadas, o que permite
 * que uma tela consulte dados de outra (ex.: Pedidos lista Produtos).
 */
export const RequireWritePermissions = (...permissions: ScreenPermission[]) =>
  SetMetadata(WRITE_PERMISSIONS_KEY, permissions);

/** Bloqueia funcionários (role USER): só ADMIN e SUPER_ADMIN passam. */
export const AdminOnly = () => SetMetadata(ADMIN_ONLY_KEY, true);
