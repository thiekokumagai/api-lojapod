import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { BillingPlanCheckoutType } from '@prisma/client';

export class CreatePlanDto {
  @ApiProperty({ description: 'Nome do plano' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ description: 'Descrição detalhada do plano' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Preço em R$', example: 150.0 })
  @IsNumber()
  @Min(0)
  price: number;

  @ApiPropertyOptional({ description: 'Dias de teste grátis (trial)', default: 7 })
  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  @ApiPropertyOptional({ description: 'Se o plano é ativo no sistema', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Se aparece no site público para seleção', default: true })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiProperty({ enum: BillingPlanCheckoutType, description: 'Tipo de checkout (SINGLE_PRODUCT ou RECURRING_SUBSCRIPTION)' })
  @IsEnum(BillingPlanCheckoutType)
  checkoutType: BillingPlanCheckoutType;

  @ApiPropertyOptional({ description: 'ID do produto / oferta no provedor de pagamento (ex: Cakto product_id)' })
  @IsOptional()
  @IsString()
  providerProductId?: string;

  @ApiPropertyOptional({ description: 'ID do plano recorrente que deve ser vinculado após compra de produto único' })
  @IsOptional()
  @IsString()
  nextSubscriptionPlanId?: string;
}
