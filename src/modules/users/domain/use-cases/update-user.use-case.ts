import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { IUsersRepository } from '../repositories/iusers.repository';
import { UserNotFoundError } from '../exceptions/user-not-found.exception';
import { UserAlreadyExistsError } from '../exceptions/user-already-exists.exception';
import { sanitizePermissions } from './create-user.use-case';
import { STAFF_ROLE } from '../../../auth/permissions/screen-permissions';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

/** Atualiza dados e permissões de um funcionário da loja. */
@Injectable()
export class UpdateUserUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(
    storeId: string,
    id: string,
    data: { name?: string; email?: string; password?: string; permissions?: string[] },
  ) {
    const user = await this.usersRepository.findStoreUser(id, storeId);
    if (!user) {
      throw new UserNotFoundError(id);
    }
    if (user.role !== STAFF_ROLE) {
      throw new ForbiddenException('Somente funcionários podem ser editados por aqui');
    }

    const update: { name?: string; email?: string; password?: string; permissions?: string[] } = {};

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('Nome é obrigatório');
      update.name = name;
    }

    if (data.email !== undefined) {
      const email = data.email.trim().toLowerCase();
      if (email !== user.email) {
        const existing = await this.usersRepository.findByEmail(email);
        if (existing && existing.id !== id) {
          throw new UserAlreadyExistsError(email);
        }
        update.email = email;
      }
    }

    if (data.password) {
      update.password = await bcrypt.hash(data.password, 10);
    }

    if (data.permissions !== undefined) {
      update.permissions = sanitizePermissions(data.permissions);
    }

    const updated = await this.usersRepository.updateStoreUser(id, update);
    JwtAuthGuard.invalidateStaff(id);
    return updated;
  }
}
