import { IsEnum, IsNumber, IsOptional, IsString, IsBoolean } from 'class-validator';
import { BillingStatus, BillingPaymentMethod } from '@prisma/client';

export class UpdateStoreSubscriptionDto {
  @IsOptional()
  @IsEnum(BillingStatus)
  status?: BillingStatus;

  @IsOptional()
  @IsNumber()
  monthlyFee?: number;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  trialEndsAt?: string;

  @IsOptional()
  @IsString()
  currentPeriodEndsAt?: string;

  @IsOptional()
  @IsEnum(BillingPaymentMethod)
  paymentMethod?: BillingPaymentMethod;

  @IsOptional()
  @IsBoolean()
  supportSelected?: boolean;
}
