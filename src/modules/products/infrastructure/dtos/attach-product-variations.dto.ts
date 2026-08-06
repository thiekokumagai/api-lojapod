import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsUUID, ArrayUnique } from 'class-validator';

export class AttachProductVariationsDto {
  @ApiProperty({ example: ['uuid1', 'uuid2'] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  variationIds: string[];
}
