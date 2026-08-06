import { Injectable } from '@nestjs/common';
import { IAuthRepository } from '../repositories/iauth.repository';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  async execute(userId: string) {
    await this.authRepository.updateRefreshToken(userId, null);
  }
}
