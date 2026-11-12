import { Injectable, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TenantContextService } from '../src/modules/tenant/tenant-context.service';

// Operações só de leitura: repetir é seguro, pois não alteram nada no banco
const READ_ACTIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

// O banco às vezes fecha conexões ociosas do pool; a primeira consulta que pega
// uma conexão dessas falha com "Server has closed the connection" (P1017)
function isClosedConnectionError(error: any): boolean {
  return (
    error?.code === 'P1017' ||
    /Server has closed the connection|Connection (reset|closed)/i.test(error?.message ?? '')
  );
}

async function runWithConnectionRetry(params: any, next: (params: any) => Promise<any>) {
  try {
    return await next(params);
  } catch (error) {
    // Dentro de transação a conexão inteira caiu, então repetir só esta consulta não adianta
    if (!params.runInTransaction && READ_ACTIONS.has(params.action) && isClosedConnectionError(error)) {
      return next(params);
    }
    throw error;
  }
}

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
          params.args.where = { ...(params.args.where || {}), storeId };
        }
        // Intercepta criação de registros (create)
        else if (params.action === 'create') {
          params.args = params.args || {};
          params.args.data = { ...(params.args.data || {}), storeId };
        }
        // Intercepta criação em lote (createMany)
        else if (params.action === 'createMany') {
          params.args = params.args || {};
          if (Array.isArray(params.args.data)) {
            params.args.data = params.args.data.map((item: any) => ({
              ...item,
              storeId,
            }));
          }
        }
      }

      return runWithConnectionRetry(params, next);
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
