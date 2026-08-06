import { Injectable } from '@nestjs/common';
import { IVariationsRepository } from '../repositories/ivariations.repository';

@Injectable()
export class ListVariationsUseCase {
  constructor(private readonly variationsRepository: IVariationsRepository) {}

  async execute() {
    return this.variationsRepository.findAll();
  }
}
