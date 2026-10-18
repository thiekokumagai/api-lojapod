import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsUUID,
  IsBoolean,
} from 'class-validator';

export class CreateOrderItemDto {
  @ApiPropertyOptional({
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    description: 'ID do produto (obrigatório se não for combo)',
  })
  @IsUUID()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({
    example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    description: 'ID do item específico do produto (variação)',
  })
  @IsUUID()
  @IsOptional()
  productItemId?: string;

  @ApiProperty({
    example: 'BLVK Spearmint 35mg',
    description: 'Nome do produto ou combo',
  })
  @IsString()
  @IsNotEmpty()
  productName: string;

  @ApiProperty({
    example: 75.0,
    description: 'Preço unitário do produto ou combo',
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

  @ApiPropertyOptional({ description: 'ID do combo se este item for um combo' })
  @IsUUID()
  @IsOptional()
  comboId?: string;

  @ApiPropertyOptional({ description: 'Indica se este item é um combo', default: false })
  @IsBoolean()
  @IsOptional()
  isCombo?: boolean;

  @ApiPropertyOptional({
    description: 'Variações escolhidas pelo cliente para os componentes do combo que não tinham variação fixa',
  })
  @IsOptional()
  comboSelections?: Array<{
    productId: string;
    productItemId?: string;
    variation?: string;
  }>;
}

