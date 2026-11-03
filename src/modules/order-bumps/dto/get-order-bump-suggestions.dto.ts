import { IsArray, IsOptional, IsString } from 'class-validator';
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
}
