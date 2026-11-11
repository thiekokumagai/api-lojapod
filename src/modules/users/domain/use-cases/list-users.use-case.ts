import { Injectable } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';

/** Lista os usuários (admin + funcionários) da loja informada. */
@Injectable()
export class ListUsersUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(storeId: string) {
    return this.usersRepository.listByStore(storeId);
  }
}
