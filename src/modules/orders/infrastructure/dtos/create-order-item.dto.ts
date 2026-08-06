import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'ID do produto',
  })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({
    example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    description: 'ID do item específico do produto (variação)',
  })
  @IsUUID()
  @IsOptional()
  productItemId?: string;

  @ApiProperty({
    example: 'BLVK Spearmint 35mg',
    description: 'Nome do produto',
  })
  @IsString()
  @IsNotEmpty()
  productName: string;

  @ApiProperty({
    example: 75.0,
    description: 'Preço unitário do produto',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 2, description: 'Quantidade de itens' })
  @IsNumber()
  @Min(1)
  quantity: number;

  @ApiPropertyOptional({ example: '35mg', description: 'Variação do produto' })
  @IsString()
  @IsOptional()
  variation?: string;
}
