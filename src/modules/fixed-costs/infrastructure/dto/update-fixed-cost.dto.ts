import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateFixedCostDto {
  @IsString()
  @MinLength(2)
  @IsOptional()
  name?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  value?: number;

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
