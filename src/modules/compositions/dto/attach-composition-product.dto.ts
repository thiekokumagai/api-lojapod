import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttachCompositionGroupDto {
  @ApiProperty({ description: 'ID do grupo de composição a vincular' })
  @IsString()
  @IsNotEmpty()
  groupId: string;

  @ApiPropertyOptional({ description: 'Ordem desta etapa no produto' })
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiPropertyOptional({
    description: 'Sobrescrita do mínimo para este produto específico',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  customMinQuantity?: number;

  @ApiPropertyOptional({
    description: 'Sobrescrita do máximo para este produto específico',
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  customMaxQuantity?: number;

  @ApiPropertyOptional({
    description: 'Sobrescrita da quantidade gratuita para este produto',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  customFreeQuantity?: number;
}

export class SyncProductCompositionsDto {
  @ApiProperty({
    type: [AttachCompositionGroupDto],
    description: 'Lista ordenada de grupos vinculados ao produto',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttachCompositionGroupDto)
  groups: AttachCompositionGroupDto[];
}
