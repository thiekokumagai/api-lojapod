import { ConflictException } from '@nestjs/common';

export class OptionInUseError extends ConflictException {
  constructor() {
    super('Não é possível remover opções já utilizadas em itens do produto');
  }
}
