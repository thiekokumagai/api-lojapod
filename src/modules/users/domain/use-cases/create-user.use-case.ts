import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { IUsersRepository } from '../repositories/iusers.repository';
import { UserAlreadyExistsError } from '../exceptions/user-already-exists.exception';
import { SCREEN_PERMISSION_KEYS } from '../../../auth/permissions/screen-permissions';

export function sanitizePermissions(permissions?: string[]): string[] {
  return [...new Set((permissions ?? []).filter((p) => SCREEN_PERMISSION_KEYS.includes(p)))];
}

/** Cria um funcionário (role USER) vinculado à loja do administrador. */
@Injectable()
export class CreateUserUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(
    storeId: string,
    data: { name: string; email: string; password: string; permissions?: string[] },
  ) {
    const email = data.email.trim().toLowerCase();
    const existingUser = await this.usersRepository.findByEmail(email);

    if (existingUser) {
      throw new UserAlreadyExistsError(email);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.usersRepository.createStoreUser({
      name: data.name.trim(),
      email,
      password: hashedPassword,
      storeId,
      permissions: sanitizePermissions(data.permissions),
    });
  }
}
