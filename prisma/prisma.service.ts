import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../src/modules/tenant/tenant-context.service';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Optional() private readonly tenantContextService?: TenantContextService,
  ) {
    super();

    const tenantScopedModels = [
      'User',
      'Category',
      'Variation',
      'Product',
      'StoreSettings',
      'Coupon',
      'Customer',
      'Order',
      'CashRegister',
      'FixedCost',
      'CashTransaction',
      'InvestmentTransaction',
      'Courier',
      'StoreSession',
      'CustomerAddress',
      'StockMovement',
      'CourierTransaction',
    ];

    this.$use(async (params, next) => {
      const storeId = this.tenantContextService?.getStoreId();

      if (storeId && params.model && tenantScopedModels.includes(params.model)) {
        // Intercepta buscas (findMany, findFirst, count, aggregate, groupBy)
        if (['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'].includes(params.action)) {
          params.args = params.args || {};
          params.args.where = { storeId, ...(params.args.where || {}) };
        }
        // Intercepta criação de registros (create)
        else if (params.action === 'create') {
          params.args = params.args || {};
          params.args.data = { storeId, ...(params.args.data || {}) };
        }
        // Intercepta criação em lote (createMany)
        else if (params.action === 'createMany') {
          params.args = params.args || {};
          if (Array.isArray(params.args.data)) {
            params.args.data = params.args.data.map((item: any) => ({
              storeId,
              ...item,
            }));
          }
        }
      }

      return next(params);
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error: any) {
      console.warn('⚠️ [Prisma] Falha ao conectar ao banco de dados na inicialização:', error.message);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
