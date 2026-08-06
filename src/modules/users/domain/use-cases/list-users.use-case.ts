import { Injectable } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';

@Injectable()
export class ListUsersUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute() {
    return this.usersRepository.findAll();
  }
}
