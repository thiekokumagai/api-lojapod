import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  storeId?: string;
  subdomain?: string;
  isActive?: boolean;
}

@Injectable()
export class TenantContextService {
  private readonly asyncLocalStorage = new AsyncLocalStorage<TenantContext>();

  run<R>(context: TenantContext, callback: () => R): R {
    return this.asyncLocalStorage.run(context, callback);
  }

  getStoreId(): string | undefined {
    return this.asyncLocalStorage.getStore()?.storeId;
  }

  setStoreId(storeId: string): void {
    const context = this.asyncLocalStorage.getStore();
    if (context) {
      context.storeId = storeId;
    }
  }

  getSubdomain(): string | undefined {
    return this.asyncLocalStorage.getStore()?.subdomain;
  }
  
  getIsActive(): boolean | undefined {
    return this.asyncLocalStorage.getStore()?.isActive;
  }

  getContext(): TenantContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  setTenantContext(context: Partial<TenantContext>): void {
    const current = this.asyncLocalStorage.getStore();
    if (current) {
      if (context.storeId !== undefined) current.storeId = context.storeId;
      if (context.subdomain !== undefined) current.subdomain = context.subdomain;
      if (context.isActive !== undefined) current.isActive = context.isActive;
    }
  }
}

