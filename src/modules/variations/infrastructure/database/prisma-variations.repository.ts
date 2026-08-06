import { Injectable } from '@nestjs/common';
import { IVariationsRepository } from '../../domain/repositories/ivariations.repository';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { Variation } from '../../domain/entities/variation.entity';
import { VariationOption } from '../../domain/entities/variation-option.entity';

@Injectable()
export class PrismaVariationsRepository implements IVariationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Variation[]> {
    return this.prisma.variation.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      include: {
        options: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async findById(id: string): Promise<Variation | null> {
    return this.prisma.variation.findFirst({
      where: { id, deletedAt: null },
      include: {
        options: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async create(title: string, options: string[]): Promise<Variation> {
    return this.prisma.variation.create({
      data: {
        title,
        options: {
          create: options.map((value, index) => ({
            value,
            order: index + 1,
          })),
        },
      },
      include: {
        options: {
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async update(
    id: string,
    title?: string,
    optionsToCreate?: { value: string; order: number }[],
    optionsToUpdate?: { id: string; value: string; order: number }[],
    optionIdsToDelete?: string[],
  ): Promise<Variation> {
    return this.prisma.$transaction(async (tx) => {
      if (title !== undefined) {
        await tx.variation.update({
          where: { id },
          data: { title },
        });
      }

      if (optionIdsToDelete && optionIdsToDelete.length > 0) {
        await tx.variationOption.deleteMany({
          where: { id: { in: optionIdsToDelete } },
        });
      }

      if (optionsToUpdate && optionsToUpdate.length > 0) {
        for (const opt of optionsToUpdate) {
          await tx.variationOption.update({
            where: { id: opt.id },
            data: { value: opt.value, order: opt.order },
          });
        }
      }

      if (optionsToCreate && optionsToCreate.length > 0) {
        for (const opt of optionsToCreate) {
          await tx.variationOption.create({
            data: {
              variationId: id,
              value: opt.value,
              order: opt.order,
            },
          });
        }
      }

      return tx.variation.findUniqueOrThrow({
        where: { id },
        include: {
          options: {
            orderBy: { order: 'asc' },
          },
        },
      });
    });
  }

  async softDelete(id: string): Promise<Variation> {
    return this.prisma.variation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findOptionsByIds(ids: string[]): Promise<VariationOption[]> {
    return this.prisma.variationOption.findMany({
      where: { id: { in: ids } },
    });
  }

  async areOptionsUsedInProducts(optionIds: string[]): Promise<boolean> {
    const usedOption = await this.prisma.productItemOption.findFirst({
      where: {
        optionId: { in: optionIds },
      },
      select: { id: true },
    });
    return !!usedOption;
  }

  async updateBatchOrder(
    items: { id: string; order: number }[],
  ): Promise<void> {
    const options = await this.prisma.variationOption.findMany({
      where: { id: { in: items.map((i) => i.id) } },
      select: { id: true, variationId: true },
    });

    const merged = items.map((item) => {
      const option = options.find((o) => o.id === item.id);
      return { ...item, variationId: option!.variationId };
    });

    const grouped = merged.reduce(
      (acc, item) => {
        if (!acc[item.variationId]) {
          acc[item.variationId] = [];
        }
        acc[item.variationId].push(item);
        return acc;
      },
      {} as Record<string, typeof merged>,
    );

    await this.prisma.$transaction(async (tx) => {
      for (const variationId in grouped) {
        const group = grouped[variationId];
        for (const item of group) {
          await tx.variationOption.update({
            where: { id: item.id },
            data: { order: item.order + 1000 },
          });
        }
      }
      for (const variationId in grouped) {
        const group = grouped[variationId];
        group.sort((a, b) => a.order - b.order);
        for (let i = 0; i < group.length; i++) {
          await tx.variationOption.update({
            where: { id: group[i].id },
            data: { order: i + 1 },
          });
        }
      }
    });
  }
}
