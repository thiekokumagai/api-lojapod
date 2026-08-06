import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  ArrayUnique,
} from 'class-validator';

export class CreateVariationDto {
  @ApiProperty({ example: 'Teor de Nicotina' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: ['3mg', '20mg', '35mg', '50mg'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  options: string[];
}
