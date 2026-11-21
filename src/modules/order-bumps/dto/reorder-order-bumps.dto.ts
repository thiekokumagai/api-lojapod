import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderOrderBumpsDto {
  @ApiProperty({
    description: 'Lista ordenada de IDs dos Order Bumps (do 1º para o último)',
    example: ['bump-id-1', 'bump-id-2'],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  ids: string[];
}
