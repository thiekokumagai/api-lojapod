import { Injectable } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';
import { UserNotFoundError } from '../exceptions/user-not-found.exception';

@Injectable()
export class UpdatePushTokenUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(userId: string, expoPushToken: string): Promise<void> {
    const user = await this.usersRepository.findById(userId);
    
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    let tokens: string[] = [];
    if (user.expoPushToken) {
      tokens = user.expoPushToken.split(',').filter(t => t.trim().length > 0);
    }
    
    if (!tokens.includes(expoPushToken)) {
      tokens.push(expoPushToken);
      if (tokens.length > 5) {
        tokens = tokens.slice(-5);
      }
      await this.usersRepository.update(userId, { expoPushToken: tokens.join(',') });
    }
  }
}
