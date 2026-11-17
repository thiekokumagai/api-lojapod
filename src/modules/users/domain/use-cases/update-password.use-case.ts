import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';
import * as bcrypt from 'bcrypt';
import { UpdatePasswordDto } from '../../infrastructure/dtos/update-password.dto';

/**
 * Troca a senha do PRÓPRIO usuário logado. O `userId` e o `storeId` vêm do token, nunca do corpo.
 * Nenhuma senha (atual, nova ou hash) vai para log ou mensagem de erro.
 */
@Injectable()
export class UpdatePasswordUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(
    userId: string,
    data: UpdatePasswordDto,
    storeId?: string | null,
  ): Promise<{ sessionsRevoked: true }> {
    if (data.newPassword !== data.confirmPassword) {
      throw new BadRequestException(
        'A nova senha e a confirmação não coincidem.',
      );
    }
    if (Buffer.byteLength(data.newPassword, 'utf8') > 72) {
      throw new BadRequestException(
        'A nova senha deve ter no máximo 72 bytes.',
      );
    }
    if (data.newPassword === data.currentPassword) {
      throw new BadRequestException(
        'A nova senha deve ser diferente da senha atual.',
      );
    }

    const user = await this.usersRepository.findById(userId);

    // Usuário de outra loja responde como inexistente
    if (!user || (user.storeId ?? null) !== (storeId ?? null)) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const isPasswordValid = await bcrypt.compare(
      data.currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('A senha atual está incorreta.');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    // `refreshToken: null` derruba a renovação de todas as sessões abertas: quem estava logado com a
    // senha antiga precisa entrar de novo. (O token de acesso já emitido vale até expirar, no máximo 15 min.)
    await this.usersRepository.update(userId, {
      password: hashedPassword,
      refreshToken: null,
    });

    return { sessionsRevoked: true };
  }
}
