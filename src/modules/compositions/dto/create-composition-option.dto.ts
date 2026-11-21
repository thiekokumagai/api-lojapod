import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateCompositionOptionDto {
  @ApiProperty({ description: 'Nome da opção (ex: Frango Grelhado, Nutella)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: 'Descrição da opção' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'URL da imagem da opção' })
  @IsString()
  @IsOptional()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Preço adicional (0 se for gratuito)', default: 0 })
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ description: 'Custo da opção para controle de CMV', default: 0 })
  @IsOptional()
  costPrice?: number;

  @ApiPropertyOptional({ description: 'Quantidade máxima permitida desta mesma opção', default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  maxQuantityPerItem?: number;

  @ApiPropertyOptional({ description: 'Ordem de exibição', default: 0 })
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({ description: 'Ativo ou inativo', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'ID de produto associado para baixa automática de estoque' })
  @IsString()
  @IsOptional()
  linkedProductId?: string;
}
