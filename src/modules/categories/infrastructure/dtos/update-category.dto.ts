import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
  IsInt,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiProperty({ example: 'Descartáveis', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  isVisible?: boolean;

  @ApiProperty({
    example: false,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  excludeFromBestSeller?: boolean;

  @ApiProperty({
    example: true,
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return false;
  })
  @IsBoolean()
  removeImage?: boolean;

  @ApiProperty({ example: 'vitrine/pod_mais_86c37d8a', required: false })

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
