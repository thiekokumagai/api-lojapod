import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';
import * as bcrypt from 'bcrypt';
import { UpdatePasswordDto } from '../../infrastructure/dtos/update-password.dto';

@Injectable()
export class UpdatePasswordUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(userId: string, data: UpdatePasswordDto): Promise<void> {
    const user = await this.usersRepository.findById(userId);

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    const isPasswordValid = await bcrypt.compare(data.currentPassword, user.password);

    if (!isPasswordValid) {
      throw new BadRequestException('A senha atual está incorreta.');
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 10);

    await this.usersRepository.update(userId, {
      password: hashedPassword,
    });
  }
}
