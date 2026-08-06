import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MinLength,
} from 'class-validator';

export class CreateFixedCostDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsNumber()
  @Min(0)
  value: number;

  @IsBoolean()
  @IsOptional()
  repeats?: boolean;

  @IsString()
  @IsOptional()
  type?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  installmentsCount?: number;
}
