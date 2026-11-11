import { StoreUser, User } from '../entities/user.entity';

export abstract class IUsersRepository {
  abstract findAll(): Promise<User[]>;
  abstract findById(id: string): Promise<User | null>;
  abstract findByEmail(email: string): Promise<User | null>;
  abstract create(data: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  abstract update(id: string, data: Partial<User>): Promise<User>;
  abstract delete(id: string): Promise<User>;

  abstract listByStore(storeId: string): Promise<StoreUser[]>;
  abstract findStoreUser(id: string, storeId: string): Promise<StoreUser | null>;
  abstract createStoreUser(data: {
    name: string;
    email: string;
    password: string;
    storeId: string;
    permissions: string[];
  }): Promise<StoreUser>;
  abstract updateStoreUser(
    id: string,
    data: { name?: string; email?: string; password?: string; permissions?: string[] },
  ): Promise<StoreUser>;
}
