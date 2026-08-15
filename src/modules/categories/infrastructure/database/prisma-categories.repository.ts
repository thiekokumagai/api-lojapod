import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { Category } from '../../domain/entities/category.entity';
import { ICategoriesRepository } from '../../domain/repositories/icategories.repository';

@Injectable()
export class PrismaCategoriesRepository implements ICategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<Category[]> {
    return this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ order: 'asc' }],
    });
  }

  async findById(id: string): Promise<Category | null> {
    return this.prisma.category.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async findLastOrder(): Promise<number> {
    const lastCategory = await this.prisma.category.findFirst({
      where: { deletedAt: null },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    return lastCategory?.order ?? 0;
  }

  async create(data: {
    title: string;
    image: string | null;

    isVisible: boolean;
    excludeFromBestSeller: boolean;
    order: number;
  }): Promise<Category> {
    return this.prisma.category.create({
      data: {
        title: data.title,
        image: data.image,
        isVisible: data.isVisible,
        excludeFromBestSeller: data.excludeFromBestSeller,
        order: data.order,
      },
    });
  }

  async update(
    id: string,
    data: {
      title?: string;
      image?: string | null;
      oldUrl?: string | null;
      isVisible?: boolean;
      excludeFromBestSeller?: boolean;
    },
  ): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: {
        title: data.title,
        image: data.image,
        oldUrl: data.oldUrl,
        isVisible: data.isVisible,
        excludeFromBestSeller: data.excludeFromBestSeller,
      },
    });
  }

  async updateOrder(id: string, order: number): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: { order },
    });
  }

  async updateBatchOrder(
    items: { id: string; order: number }[],
  ): Promise<void> {
    await this.prisma.$transaction(
      items.map((item) =>
        this.prisma.category.update({
          where: { id: item.id },
          data: { order: item.order },
        }),
      ),
    );
  }

  async decrementOrdersAbove(order: number): Promise<void> {
    await this.prisma.category.updateMany({
      where: {
        deletedAt: null,
        order: {
          gt: order,
        },
      },
      data: {
        order: {
          decrement: 1,
        },
      },
    });
  }

  async softDelete(id: string): Promise<Category> {
    return this.prisma.category.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });
  }
}
