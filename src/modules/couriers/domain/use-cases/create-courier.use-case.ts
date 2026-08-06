import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class CreateCourierUseCase {
  constructor(private prisma: PrismaService) {}

  async execute(data: { name: string; phone: string }) {
    if (!data.name || !data.phone) {
      throw new Error('Name and phone are required');
    }
    
    return this.prisma.courier.create({
      data: {
        name: data.name,
        phone: data.phone,
      }
    });
  }
}
