import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { IAuthRepository } from '../repositories/iauth.repository';
import { removeRefreshSession } from '../utils/refresh-sessions';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly authRepository: IAuthRepository) {}

  /**
   * Encerra SÓ a sessão do refresh token enviado. As dos outros aparelhos continuam logadas
   * (derrubar todas seria "sair de todos os aparelhos", uma ação separada).
   * Idempotente: se o token já não valia, não há nada a revogar.
   */
  async execute(userId: string, refreshToken: string): Promise<void> {
    const result = await this.authRepository.rotateRefreshToken(
      userId,
      (stored) => removeRefreshSession(stored, refreshToken),
    );
    if (result === 'conflict') {
      throw new ServiceUnavailableException(
        'Não foi possível encerrar a sessão agora. Tente novamente.',
      );
    }
  }
}
