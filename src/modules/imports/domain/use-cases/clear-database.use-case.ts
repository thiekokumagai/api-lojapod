/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ClearDatabaseUseCase {
  private readonly logger = new Logger(ClearDatabaseUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(storeId: string) {
    this.logger.log(`Iniciando limpeza de dados importados para reimportação... (storeId: ${storeId})`);

    try {
      this.logger.log(`Removendo pedidos importados da loja ${storeId}...`);
      await this.prisma.order.deleteMany({
        where: { storeId, externalId: { not: null } },
      });

      this.logger.log(`Removendo produtos importados da loja ${storeId}...`);
      await this.prisma.product.deleteMany({
        where: { storeId, externalId: { not: null } },
      });

      this.logger.log(`Removendo categorias importadas da loja ${storeId}...`);
      await this.prisma.category.deleteMany({
        where: { storeId, externalId: { not: null } },
      });

      this.logger.log('Limpeza de dados importados finalizada com sucesso!');
    } catch (error) {
      this.logger.error('Erro ao limpar banco de dados', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}
