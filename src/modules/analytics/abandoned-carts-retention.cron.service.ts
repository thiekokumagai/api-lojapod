import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AbandonedCartsService } from './abandoned-carts.service';

/** Todo dia apaga nome e telefone de carrinhos sem atividade há mais de 30 dias. */
@Injectable()
export class AbandonedCartsRetentionCronService {
  private readonly logger = new Logger(AbandonedCartsRetentionCronService.name);

  constructor(private readonly abandonedCarts: AbandonedCartsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'America/Sao_Paulo' })
  async wipeExpiredContacts() {
    try {
      const count = await this.abandonedCarts.wipeExpiredContacts();
      if (count > 0) {
        this.logger.log(`Contatos de carrinhos antigos apagados: ${count}`);
      }
    } catch (error: unknown) {
      this.logger.error(
        `Falha ao apagar contatos antigos: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
