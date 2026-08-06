import { NotFoundException } from '@nestjs/common';

export class VariationNotFoundError extends NotFoundException {
  constructor() {
    super('Variação não encontrada');
  }
}
