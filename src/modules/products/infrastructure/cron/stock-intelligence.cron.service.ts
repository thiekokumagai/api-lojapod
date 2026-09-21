import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ComputeStockIntelligenceUseCase } from '../../domain/use-cases/compute-stock-intelligence.use-case';
import { PushNotificationService } from '../../../../shared/services/push-notification.service';

@Injectable()
export class StockIntelligenceCronService {
  private readonly logger = new Logger(StockIntelligenceCronService.name);
  private lastDigestDate: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly computeStockIntelligenceUseCase: ComputeStockIntelligenceUseCase,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM, { timeZone: 'America/Sao_Paulo' })
  async handleNightlyComputation() {
    this.logger.log('Disparando cron de inteligência de estoque (04:00)...');
    try {
      await this.computeStockIntelligenceUseCase.execute();
    } catch (error) {
      this.logger.error('Erro no cron de inteligência de estoque:', error);
    }
  }

  @Cron('0 0 10 * * *', { timeZone: 'America/Sao_Paulo' })
  async handleMorningDigest() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.lastDigestDate === today) {
      this.logger.log('Digest matinal já enviado hoje.');
      return;
    }

    this.logger.log('Preparando Radar de Oportunidades matinal (09:00)...');

    try {
      const stats = await this.computeStockIntelligenceUseCase.execute();

      if (stats.criticalCount === 0 && stats.stagnantCount === 0) {
        this.logger.log('Nenhum alerta crítico ou oportunidade urgente para notificar hoje.');
        return;
      }

      const admins = await this.prisma.user.findMany();

      const tokens: string[] = [];
      const webSubscriptions: unknown[] = [];

      for (const admin of admins) {
        if (admin.expoPushToken) {
          tokens.push(...admin.expoPushToken.split(',').filter(Boolean));
        }
        if (admin.webPushSubscription) {
          if (Array.isArray(admin.webPushSubscription)) {
            webSubscriptions.push(...admin.webPushSubscription);
          } else {
            webSubscriptions.push(admin.webPushSubscription);
          }
        }
      }

      if (tokens.length === 0 && webSubscriptions.length === 0) {
        this.logger.log('Nenhum dispositivo admin cadastrado para push.');
        return;
      }

      const currencyFormatter = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
      });
      const formattedStagnant = currencyFormatter.format(stats.stagnantCapital);

      const parts: string[] = [];
      if (stats.criticalCount > 0) {
        parts.push(`${stats.criticalCount} produto(s) críticos`);
      }
      if (stats.stagnantCount > 0) {
        parts.push(`${formattedStagnant} parados sem giro`);
      }

      const title = '💡 Radar de Oportunidades LojaPod';
      const body = `${parts.join(' e ')}. Veja as sugestões de compra e reposição.`;

      await this.pushNotificationService.sendNotifications(
        tokens,
        title,
        body,
        { screen: 'Opportunities', url: '/investimentos/analise-compras' },
        webSubscriptions,
      );

      this.lastDigestDate = today;
      this.logger.log('Digest matinal enviado com sucesso.');
    } catch (error) {
      this.logger.error('Erro ao enviar digest matinal:', error);
    }
  }
}
