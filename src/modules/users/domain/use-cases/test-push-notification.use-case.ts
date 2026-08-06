import { Injectable, BadRequestException } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';
import { PushNotificationService } from '../../../../shared/services/push-notification.service';
import { UserNotFoundError } from '../exceptions/user-not-found.exception';

@Injectable()
export class TestPushNotificationUseCase {
  constructor(
    private readonly usersRepository: IUsersRepository,
    private readonly pushNotificationService: PushNotificationService,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new UserNotFoundError(userId);
    }

    if (!user.expoPushToken && !user.webPushSubscription) {
      throw new BadRequestException('Usuário não possui token de notificação registrado.');
    }

    try {
      const tokens = user.expoPushToken ? user.expoPushToken.split(',').filter(Boolean) : [];
      const webSubs = user.webPushSubscription 
        ? (Array.isArray(user.webPushSubscription) ? user.webPushSubscription : [user.webPushSubscription]) 
        : [];
      
      await this.pushNotificationService.sendNotifications(
        tokens,
        'Teste de Notificação 🚀',
        'Seu dispositivo está pronto para receber notificações de novos pedidos!',
        undefined,
        webSubs
      );
    } catch (err: any) {
      throw new BadRequestException(`Erro ao enviar push: ${err.message}`);
    }
  }
}
