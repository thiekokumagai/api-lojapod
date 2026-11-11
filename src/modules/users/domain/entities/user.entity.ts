export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role?: 'ADMIN' | 'USER' | 'SUPER_ADMIN';
  permissions?: string[];
  storeId?: string | null;
  expoPushToken?: string | null;
  webPushSubscription?: any;
  createdAt: Date;
}

/** Dados públicos de um usuário da loja (nunca inclui senha/tokens). */
export interface StoreUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER' | 'SUPER_ADMIN';
  permissions: string[];
  createdAt: Date;
}
