import { Injectable } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';
import { UserNotFoundError } from '../exceptions/user-not-found.exception';

@Injectable()
export class UpdateWebPushSubscriptionUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(userId: string, subscription: any): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    let subscriptions: any[] = [];
    if (user.webPushSubscription) {
      if (Array.isArray(user.webPushSubscription)) {
        subscriptions = user.webPushSubscription;
      } else {
        subscriptions = [user.webPushSubscription];
      }
    }

    const existsIndex = subscriptions.findIndex(sub => sub.endpoint === subscription.endpoint);
    if (existsIndex >= 0) {
      subscriptions[existsIndex] = subscription; // refresh keys
    } else {
      subscriptions.push(subscription);
    }

    await this.usersRepository.update(userId, { webPushSubscription: subscriptions });
  }
}
