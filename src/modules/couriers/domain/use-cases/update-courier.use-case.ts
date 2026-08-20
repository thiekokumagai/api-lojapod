import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class UpdateCourierUseCase {
  constructor(private prisma: PrismaService) {}

  async execute(id: string, data: { name?: string; phone?: string; isActive?: boolean }) {
    const courier = await this.prisma.courier.findUnique({ where: { id } });
    if (!courier) {
      throw new NotFoundException('Motoboy não encontrado');
    }

    return this.prisma.courier.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }
}
