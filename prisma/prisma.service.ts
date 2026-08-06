import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
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
