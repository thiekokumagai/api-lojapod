import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateOrderBumpDto {
  @ApiProperty({ description: 'Título exibido na seção (ex: Peça também)', default: 'Peça também' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ description: 'Status ativo/inativo', default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({ description: 'Prioridade de exibição (maior aparece primeiro)', default: 0 })
  @IsNumber()
  @IsOptional()
  priority?: number;

  @ApiProperty({ description: 'Tipo de gatilho: ALL, CATEGORY ou PRODUCT', default: 'ALL' })
  @IsString()
  @IsNotEmpty()
  triggerType: 'ALL' | 'CATEGORY' | 'PRODUCT';

  @ApiProperty({ description: 'ID do produto que dispara a sugestão (se triggerType for PRODUCT)', required: false })
  @IsString()
  @IsOptional()
  triggerProductId?: string;

  @ApiProperty({ description: 'ID da categoria que dispara a sugestão (se triggerType for CATEGORY)', required: false })
  @IsString()
  @IsOptional()
  triggerCategoryId?: string;

  @ApiProperty({ description: 'ID do produto sugerido para adicionar ao carrinho' })
  @IsString()
  @IsNotEmpty()
  suggestedProductId: string;

  @ApiProperty({ description: 'Preço promocional fixo exclusivo do Order Bump (opcional)', required: false })
  @IsNumber()
  @IsOptional()
  customPrice?: number;

  @ApiProperty({ description: 'Percentual de desconto exclusivo do Order Bump (opcional)', required: false })
  @IsNumber()
  @IsOptional()
  discountPercent?: number;
}
