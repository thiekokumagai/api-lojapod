import { BadRequestException } from '@nestjs/common';

export class EmptyOptionsError extends BadRequestException {
  constructor() {
    super('A variação deve ter ao menos uma opção');
  }
}
