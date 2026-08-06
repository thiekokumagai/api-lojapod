import { ConflictException } from '@nestjs/common';

export class UserAlreadyExistsError extends ConflictException {
  constructor(email: string) {
    super(`Usuário com o email ${email} já existe`);
  }
}
