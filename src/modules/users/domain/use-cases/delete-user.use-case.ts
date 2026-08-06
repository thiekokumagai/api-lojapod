import { Injectable } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';
import { UserNotFoundError } from '../exceptions/user-not-found.exception';

@Injectable()
export class DeleteUserUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(id: string) {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new UserNotFoundError(id);
    }

    return this.usersRepository.delete(id);
  }
}
