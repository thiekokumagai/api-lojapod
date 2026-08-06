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
import { Type } from 'class-transformer';

export class UpdateVariationDto {
  @ApiPropertyOptional({ example: 'Teor de Nicotina' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: ['3mg', '20mg', '35mg', '50mg'] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  options?: string[];
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
