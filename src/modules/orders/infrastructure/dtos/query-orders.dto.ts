import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PaymentStatus } from '../../domain/entities/order.entity';

export class QueryOrdersDto {
  @ApiProperty({ example: 'Ana beatriz', required: false })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ example: 'PENDING', enum: OrderStatus, required: false })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @ApiProperty({ example: 'PENDING', enum: PaymentStatus, required: false })
  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  page?: any;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  limit?: any;
}
