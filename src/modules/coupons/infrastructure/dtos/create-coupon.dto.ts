import {
  IsString,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsDateString,
  IsPositive,
} from 'class-validator';
import { DiscountType } from '../../domain/entities/coupon.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCouponDto {
  @ApiProperty()
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  status?: boolean;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  type: DiscountType;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  value?: number;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  validUntilDate?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  startTime?: string;

  @ApiPropertyOptional()
  @IsDateString()
  @IsOptional()
  endTime?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsPositive()
  @IsOptional()
  maxUses?: number;

  @ApiPropertyOptional()
  @IsNumber()
  @IsPositive()
  @IsOptional()
  minOrderValue?: number;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  applyToPromotionalItems?: boolean;
}
