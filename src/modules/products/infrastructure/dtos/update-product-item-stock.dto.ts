import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsString, IsOptional, IsEnum, Min } from 'class-validator';
import { StockMovementType } from '@prisma/client';

export class UpdateProductItemStockDto {
  @ApiProperty({ enum: StockMovementType, example: 'ADD' })
  @IsEnum(StockMovementType)
  type: StockMovementType;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({ example: 'Entrada de mercadoria' })
  @IsString()
  @IsOptional()
  observation?: string;
}
