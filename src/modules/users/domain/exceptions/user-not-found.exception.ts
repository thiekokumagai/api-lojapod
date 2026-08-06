import { NotFoundException } from '@nestjs/common';

export class UserNotFoundError extends NotFoundException {
  constructor(idOrEmail: string) {
    super(`Usuário não encontrado: ${idOrEmail}`);
  }
}
