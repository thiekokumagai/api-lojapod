import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateLoyaltyProgramDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  stampsRequired?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderValue?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  validityDays?: number;

  @IsOptional()
  @IsString()
  rewardText?: string;

  @IsOptional()
  @IsString()
  rewardCouponCode?: string;

  @IsOptional()
  @IsNumber()
  rewardDiscount?: number;

  @IsOptional()
  @IsNumber()
  pointsPerReal?: number;

  @IsOptional()
  @IsNumber()
  pointsRedemptionValue?: number;

  @IsOptional()
  @IsNumber()
  cashbackPercent?: number;

  @IsOptional()
  progressiveTiers?: any;
}
