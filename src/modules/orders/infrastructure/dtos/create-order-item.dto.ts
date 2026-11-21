import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsInt,
  IsArray,
  ArrayMaxSize,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// Campos informativos (nome, preços) são aceitos para não recusar o payload do front,
// mas o servidor os descarta e refaz o snapshot a partir do banco.
export class CustomizationOptionDto {
  @ApiProperty({ description: 'ID da opção (CompositionOption)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  optionId: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  totalPrice?: number;
}

export class CustomizationStageDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  groupId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  groupName?: string;

  @ApiProperty({ type: [CustomizationOptionDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CustomizationOptionDto)
  options: CustomizationOptionDto[];
}

export class CustomizationSnapshotDto {
  @ApiProperty({ type: [CustomizationStageDto] })
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CustomizationStageDto)
  stages: CustomizationStageDto[];

  @IsOptional()
  @IsNumber()
  basePrice?: number;

  @IsOptional()
  @IsNumber()
  totalAdditions?: number;

  @IsOptional()
  @IsNumber()
  finalUnitPrice?: number;
}

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

  @ApiPropertyOptional({
    description: 'Indica se este item é um combo',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isCombo?: boolean;

  @ApiPropertyOptional({
    description: 'Indica se este item foi adicionado via Order Bump',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isOrderBump?: boolean;

  @ApiPropertyOptional({
    description: 'ID da regra de Order Bump que originou este item',
  })
  @IsString()
  @IsOptional()
  orderBumpId?: string;

  @ApiPropertyOptional({
    description:
      'Variações escolhidas pelo cliente para os componentes do combo que não tinham variação fixa',
  })
  @IsOptional()
  comboSelections?: Array<{
    productId: string;
    productItemId?: string;
    variation?: string;
  }>;

  @ApiPropertyOptional({
    description: 'Indica se este item foi montado por etapas',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  isCustomized?: boolean;

  @ApiPropertyOptional({
    type: () => CustomizationSnapshotDto,
    description:
      'Escolhas da montagem. O servidor só usa optionId e quantity; nome, preço e cotas vêm do banco.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomizationSnapshotDto)
  customizationSnapshot?: CustomizationSnapshotDto;
}
