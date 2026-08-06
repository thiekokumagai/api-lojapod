import { IsString, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceiveOrderDto {
  @ApiPropertyOptional({ example: 'PIX' })
  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'Online' })
  @IsString()
  @IsOptional()
  paymentType?: string;

  @ApiPropertyOptional({ example: 5.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  paymentDiscount?: number;

  @ApiPropertyOptional({ example: 2.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  installmentSurcharge?: number;

  @ApiPropertyOptional({ example: 10.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  couponDiscount?: number;

  @ApiPropertyOptional({ example: 15.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  couponFreightDiscount?: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  receiptDiscount?: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  receiptSurcharge?: number;

  @ApiProperty({ example: 150.0, required: true })
  @IsNumber()
  @Min(0)
  totalReceived: number;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  installments?: number;

  @ApiPropertyOptional({ example: 4.5 })
  @IsNumber()
  @IsOptional()
  cardFee?: number;
}
