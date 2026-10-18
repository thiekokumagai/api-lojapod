import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsBoolean,
  IsDateString,
  IsArray,
  ValidateNested,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateComboItemDto {
  @ApiProperty({ description: 'ID do produto componente' })
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @ApiPropertyOptional({ description: 'ID do item de variação do produto' })
  @IsUUID()
  @IsOptional()
  productItemId?: string;

  @ApiProperty({ description: 'Quantidade deste produto no combo', example: 1 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  quantity: number;

  @ApiPropertyOptional({ description: 'Texto da variação selecionada (ex: 35mg)', example: '35mg' })
  @IsString()
  @IsOptional()
  variation?: string;
}

export class CreateComboDto {
  @ApiProperty({ description: 'Nome do combo', example: 'Super Combo Juice + Pod' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Descrição detalhada do combo' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'URL da imagem do combo' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'ID da categoria opcional' })
  @ValidateIf((o) => o.categoryId !== null && o.categoryId !== undefined && o.categoryId !== '')
  @IsUUID('all', { message: 'categoryId must be a UUID' })
  @IsOptional()
  categoryId?: string | null;

  @ApiProperty({ description: 'Preço de venda do combo', example: 99.9 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  price: number;

  @ApiPropertyOptional({ description: 'Combo ativo para venda', default: true })
  @IsBoolean()
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Data de início da disponibilidade' })
  @ValidateIf((o) => o.startDate !== null && o.startDate !== undefined && o.startDate !== '')
  @IsDateString()
  @IsOptional()
  startDate?: string | null;

  @ApiPropertyOptional({ description: 'Data final de disponibilidade' })
  @ValidateIf((o) => o.endDate !== null && o.endDate !== undefined && o.endDate !== '')
  @IsDateString()
  @IsOptional()
  endDate?: string | null;

  @ApiPropertyOptional({ description: 'Limite máximo de unidades por pedido' })
  @ValidateIf((o) => o.maxPerOrder !== null && o.maxPerOrder !== undefined && o.maxPerOrder !== '')
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  maxPerOrder?: number | null;

  @ApiPropertyOptional({ description: 'Limite total de vendas do combo' })
  @ValidateIf((o) => o.maxTotalSales !== null && o.maxTotalSales !== undefined && o.maxTotalSales !== '')
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  maxTotalSales?: number | null;

  @ApiProperty({ description: 'Itens que compõem o combo', type: [CreateComboItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateComboItemDto)
  items: CreateComboItemDto[];
}
