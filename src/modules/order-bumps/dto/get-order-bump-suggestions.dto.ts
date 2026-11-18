import { IsArray, IsIn, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetOrderBumpSuggestionsDto {
  @ApiProperty({ description: 'Lista de IDs dos produtos atualmente no carrinho', type: [String], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  productIds?: string[];

  @ApiProperty({ description: 'Lista de IDs das categorias dos produtos atualmente no carrinho', type: [String], required: false })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  categoryIds?: string[];

  @ApiProperty({
    description:
      'Onde o cliente está vendo as ofertas: CART (carrinho, padrão) ou PRODUCT (tela do produto). Só vêm as ofertas marcadas para esse lugar ou para BOTH.',
    enum: ['CART', 'PRODUCT'],
    default: 'CART',
    required: false,
  })
  @IsIn(['CART', 'PRODUCT'])
  @IsOptional()
  location?: 'CART' | 'PRODUCT';
}
