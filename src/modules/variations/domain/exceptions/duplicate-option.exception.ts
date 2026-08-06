import { ConflictException } from '@nestjs/common';

export class DuplicateOptionError extends ConflictException {
  constructor() {
    super('Não pode existir duplicação de opção dentro da mesma variação');
  }
}
