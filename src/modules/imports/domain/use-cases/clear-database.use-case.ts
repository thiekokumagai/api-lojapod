/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ClearDatabaseUseCase {
  private readonly logger = new Logger(ClearDatabaseUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    this.logger.log('Iniciando limpeza de banco de dados para reimportação...');

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
          this.logger.log(`Truncando tabela: ${tablename}`);
          await this.prisma.$executeRawUnsafe(
            `TRUNCATE TABLE "${tablename}" CASCADE;`,
          );
        }
      }

      this.logger.log('Limpeza do banco de dados finalizada com sucesso!');
    } catch (error) {
      this.logger.error('Erro ao limpar banco de dados', error.message);
      throw error;
    }
  }
}
