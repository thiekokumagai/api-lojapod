import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class UpdateVariationOptionDto {
  @ApiPropertyOptional({ example: 'uuid-123' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: '35mg' })
  @IsString()
  value: string;
}

export class UpdateVariationDto {
  @ApiPropertyOptional({ example: 'Teor de Nicotina' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: [
      { id: 'uuid-1', value: '3mg' },
      { value: '35mg' },
      '50mg',
    ],
  })
  @IsOptional()
  @IsArray()
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((item) => {
      if (typeof item === 'string') {
        return { value: item };
      }
      return item;
    });
  })
  @ValidateNested({ each: true })
  @Type(() => UpdateVariationOptionDto)
  options?: UpdateVariationOptionDto[];
}

export class UpdateOrderItemDto {
  @IsUUID()
  id: string;

  @IsInt()
  order: number;
}

export class UpdateOrderDto {
  @ApiProperty({
    type: [UpdateOrderItemDto],
    example: [
      { id: 'uuid', order: 1 },
      { id: 'uuid', order: 2 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderItemDto)
  items: UpdateOrderItemDto[];
}
