import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import type { ICombosRepository, ComboFilters } from '../../domain/repositories/icombos.repository';
import { CreateComboDto } from '../dtos/create-combo.dto';
import { UpdateComboDto } from '../dtos/update-combo.dto';
import { Combo } from '../../domain/entities/combo.entity';

@Injectable()
export class CombosService {
  constructor(
    @Inject('ICombosRepository')
    private readonly combosRepository: ICombosRepository,
  ) {}

  async create(dto: CreateComboDto): Promise<Combo> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('O combo deve conter pelo menos um produto componente.');
    }

    if (dto.price <= 0) {
      throw new BadRequestException('O preço do combo deve ser maior que zero.');
    }

    for (const item of dto.items) {
      if (item.quantity < 1) {
        throw new BadRequestException('A quantidade de cada produto componente deve ser no mínimo 1.');
      }
    }

    return this.combosRepository.create(
      {
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        categoryId: dto.categoryId,
        price: dto.price,
        isActive: dto.isActive,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        maxPerOrder: dto.maxPerOrder,
        maxTotalSales: dto.maxTotalSales,
      },
      dto.items,
    );
  }

  async update(id: string, dto: UpdateComboDto): Promise<Combo> {
    if (dto.items && dto.items.length === 0) {
      throw new BadRequestException('O combo deve conter pelo menos um produto componente.');
    }

    if (dto.price !== undefined && dto.price <= 0) {
      throw new BadRequestException('O preço do combo deve ser maior que zero.');
    }

    return this.combosRepository.update(
      id,
      {
        name: dto.name,
        description: dto.description,
        imageUrl: dto.imageUrl,
        categoryId: dto.categoryId,
        price: dto.price,
        isActive: dto.isActive,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        maxPerOrder: dto.maxPerOrder,
        maxTotalSales: dto.maxTotalSales,
      },
      dto.items,
    );
  }

  async duplicate(id: string): Promise<Combo> {
    const existing = await this.combosRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Combo não encontrado.');
    }

    const items = (existing.items || []).map((i) => ({
      productId: i.productId,
      productItemId: i.productItemId || null,
      quantity: i.quantity,
      variation: i.variation || null,
    }));

    return this.combosRepository.create(
      {
        name: `${existing.name} (Cópia)`,
        description: existing.description,
        imageUrl: existing.imageUrl,
        categoryId: existing.categoryId,
        price: existing.price,
        isActive: false, // Inativo por padrão ao duplicar
        startDate: existing.startDate,
        endDate: existing.endDate,
        maxPerOrder: existing.maxPerOrder,
        maxTotalSales: existing.maxTotalSales,
      },
      items,
    );
  }

  async toggleActive(id: string): Promise<Combo> {
    const existing = await this.combosRepository.findById(id);
    if (!existing) {
      throw new NotFoundException('Combo não encontrado.');
    }

    return this.combosRepository.update(id, { isActive: !existing.isActive });
  }

  async delete(id: string): Promise<void> {
    return this.combosRepository.delete(id);
  }

  async findById(id: string): Promise<Combo> {
    const combo = await this.combosRepository.findById(id);
    if (!combo) {
      throw new NotFoundException('Combo não encontrado.');
    }
    return combo;
  }

  async findMany(filters: ComboFilters): Promise<Combo[]> {
    return this.combosRepository.findMany(filters);
  }

  async findStoreCombos(): Promise<Combo[]> {
    return this.combosRepository.findStoreCombos();
  }
}
