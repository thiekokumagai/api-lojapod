import { Injectable } from '@nestjs/common';
import { ICouponsRepository } from '../../domain/repositories/icoupons.repository';
import { Coupon, DiscountType } from '../../domain/entities/coupon.entity';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class PrismaCouponsRepository implements ICouponsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(coupon: Coupon): Promise<Coupon> {
    const data = await this.prisma.coupon.create({
      data: {
        title: coupon.title,
        status: coupon.status,
        type: coupon.type,
        value: coupon.value,
        validUntilDate: coupon.validUntilDate,
        startTime: coupon.startTime,
        endTime: coupon.endTime,
        maxUses: coupon.maxUses,
        currentUses: coupon.currentUses,
        minOrderValue: coupon.minOrderValue,
        applyToPromotionalItems: coupon.applyToPromotionalItems,
      },
    });
    return this.mapToDomain(data);
  }

  async update(id: string, coupon: Partial<Coupon>): Promise<Coupon> {
    const data = await this.prisma.coupon.update({
      where: { id },
      data: {
        title: coupon.title,
        status: coupon.status,
        type: coupon.type as any,
        value: coupon.value,
        validUntilDate: coupon.validUntilDate,
        startTime: coupon.startTime,
        endTime: coupon.endTime,
        maxUses: coupon.maxUses,
        currentUses: coupon.currentUses,
        minOrderValue: coupon.minOrderValue,
        applyToPromotionalItems: coupon.applyToPromotionalItems,
      },
    });
    return this.mapToDomain(data);
  }

  async findById(id: string): Promise<Coupon | null> {
    const data = await this.prisma.coupon.findUnique({ where: { id } });
    if (!data) return null;
    return this.mapToDomain(data);
  }

  async findByTitle(title: string): Promise<Coupon | null> {
    const data = await this.prisma.coupon.findUnique({ where: { title } });
    if (!data) return null;
    return this.mapToDomain(data);
  }

  async findAll(): Promise<Coupon[]> {
    const data = await this.prisma.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return data.map((d) => this.mapToDomain(d));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.coupon.delete({ where: { id } });
  }

  private mapToDomain(data: any): Coupon {
    return new Coupon({
      id: data.id,
      title: data.title,
      status: data.status,
      type: data.type as DiscountType,
      value: data.value ? Number(data.value) : undefined,
      validUntilDate: data.validUntilDate,
      startTime: data.startTime,
      endTime: data.endTime,
      maxUses: data.maxUses,
      currentUses: data.currentUses,
      minOrderValue: data.minOrderValue
        ? Number(data.minOrderValue)
        : undefined,
      applyToPromotionalItems: data.applyToPromotionalItems,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    });
  }
}
