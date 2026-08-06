import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
  ArrayUnique,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductItemInputDto {
  @ApiPropertyOptional({
    example: [
      '550e8400-e29b-41d4-a716-446655440000',
      '660e8400-e29b-41d4-a716-446655440000',
    ],
    description:
      'Lista de IDs das opções de variação. Obrigatório apenas para produtos com variações.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  options?: string[];

  @ApiProperty({ example: 10 })
  @IsInt()
  @Min(0)
  stock: number;
}

export class CreateProductItemsDto {
  @ApiProperty({
    type: [CreateProductItemInputDto],
    example: [
      {

        stock: 10,
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductItemInputDto)
  items: CreateProductItemInputDto[];
}
