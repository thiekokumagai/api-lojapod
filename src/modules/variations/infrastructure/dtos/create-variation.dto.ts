import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateVariationDto {
  @ApiProperty({ example: 'Teor de Nicotina' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: ['3mg', '20mg', '35mg', '50mg'] })
  @IsArray()
  @ArrayMinSize(1)
  @Transform(({ value }) => {
    if (!Array.isArray(value)) return value;
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item === 'object' && item !== null && 'value' in item) {
        return item.value;
      }
      return item;
    });
  })
  @IsString({ each: true })
  options: string[];
}
