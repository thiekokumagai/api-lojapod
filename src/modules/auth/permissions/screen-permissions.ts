/**
 * Catálogo de permissões por tela do painel da loja.
 *
 * Usuários com perfil `USER` (funcionários da loja) só acessam as telas cujas
 * chaves estiverem em `User.permissions`. `ADMIN` e `SUPER_ADMIN` acessam tudo.
 *
 * Mantenha em sincronia com `admin-lojapod/src/lib/permissions.ts`.
 */
export const SCREEN_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard', group: 'Geral' },
  { key: 'links', label: 'Página de Links', group: 'Geral' },

  { key: 'products', label: 'Produtos', group: 'Catálogo' },
  { key: 'combos', label: 'Combos', group: 'Catálogo' },
  { key: 'order_bumps', label: 'Peça também', group: 'Catálogo' },
  { key: 'stock_notifications', label: 'Avise-me quando chegar', group: 'Catálogo' },
  { key: 'categories', label: 'Categorias', group: 'Catálogo' },
  { key: 'variations', label: 'Variações', group: 'Catálogo' },
  { key: 'coupons', label: 'Cupons', group: 'Catálogo' },

  { key: 'orders', label: 'Pedidos', group: 'Vendas' },
  { key: 'loyalty', label: 'Cartão Fidelidade', group: 'Vendas' },
  { key: 'delivery_map', label: 'Mapa de Entregas', group: 'Vendas' },
  { key: 'couriers', label: 'Motoboys', group: 'Vendas' },
  { key: 'customers', label: 'Clientes', group: 'Vendas' },

  { key: 'cash_current', label: 'Caixa Atual', group: 'Financeiro' },
  { key: 'fixed_costs', label: 'Contas Fixas', group: 'Financeiro' },
  { key: 'investments', label: 'Módulo de Investimento', group: 'Financeiro' },
  { key: 'cash_history', label: 'Histórico de Caixas', group: 'Financeiro' },

  { key: 'settings', label: 'Configurações', group: 'Configuração' },
] as const;

export type ScreenPermission = (typeof SCREEN_PERMISSIONS)[number]['key'];

export const SCREEN_PERMISSION_KEYS: string[] = SCREEN_PERMISSIONS.map((p) => p.key);

/** Perfil dos funcionários da loja (restrito por permissões). */
export const STAFF_ROLE = 'USER';
