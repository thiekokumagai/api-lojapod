import { ForbiddenException, Injectable } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';
import { UserNotFoundError } from '../exceptions/user-not-found.exception';
import { STAFF_ROLE } from '../../../auth/permissions/screen-permissions';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

/** Remove um funcionário da loja. O administrador não pode ser removido. */
@Injectable()
export class DeleteUserUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(storeId: string, id: string) {
    const user = await this.usersRepository.findStoreUser(id, storeId);

    if (!user) {
      throw new UserNotFoundError(id);
    }
    if (user.role !== STAFF_ROLE) {
      throw new ForbiddenException('O administrador da loja não pode ser removido');
    }

    await this.usersRepository.delete(id);
    JwtAuthGuard.invalidateStaff(id);
    return { success: true };
  }
}
