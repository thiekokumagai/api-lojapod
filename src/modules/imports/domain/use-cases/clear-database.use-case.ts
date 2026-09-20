/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ClearDatabaseUseCase {
  private readonly logger = new Logger(ClearDatabaseUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute(storeId: string) {
    this.logger.log(`Iniciando limpeza de banco de dados para reimportação... (storeId: ${storeId})`);

    const tablesToKeep = [
      'store_settings',
      'users',
      '_prisma_migrations',
      'variations',
      'variation_options',
    ];

    try {
      // Obter todas as tabelas do schema public
      const result = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname='public';
      `;

      for (const { tablename } of result) {
        if (!tablesToKeep.includes(tablename)) {
          // Check if table has storeId column
          const columns = await this.prisma.$queryRaw<Array<{ column_name: string }>>`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = ${tablename} AND column_name = 'storeId';
          `;

          if (columns.length > 0) {
            this.logger.log(`Limpando dados da tabela (storeId: ${storeId}): ${tablename}`);
            await this.prisma.$executeRawUnsafe(
              `DELETE FROM "${tablename}" WHERE "storeId" = '${storeId}';`,
            );
          } else {
             // For tables without storeId but might belong to an entity with storeId (e.g. relation tables),
             // this simple script might skip them. A CASCADE on storeId at the Prisma level is better,
             // but for safety, we only delete where storeId exists.
            this.logger.log(`Pulando tabela sem storeId direto: ${tablename}`);
          }
        }
      }

      this.logger.log('Limpeza do banco de dados finalizada com sucesso!');
    } catch (error) {
      this.logger.error('Erro ao limpar banco de dados', error.message);
      throw error;
    }
  }
}
