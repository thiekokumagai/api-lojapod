import { Injectable } from '@nestjs/common';
import { IUsersRepository } from '../repositories/iusers.repository';
import { UserAlreadyExistsError } from '../exceptions/user-already-exists.exception';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';

@Injectable()
export class CreateUserUseCase {
  constructor(private readonly usersRepository: IUsersRepository) {}

  async execute(data: Omit<User, 'id' | 'createdAt'>) {
    const existingUser = await this.usersRepository.findByEmail(data.email);

    if (existingUser) {
      throw new UserAlreadyExistsError(data.email);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.usersRepository.create({
      ...data,
      password: hashedPassword,
    });
  }
}
