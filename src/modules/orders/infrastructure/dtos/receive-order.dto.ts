import { IsString, IsNumber, IsOptional, Min, Max, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const ALLOWED_PAYMENT_METHODS = [
  'pix',
  'credit',
  'debit',
  'cash',
  'meal_voucher',
  'food_voucher',
  'PIX',
  'Cartão de Crédito',
  'credito',
  'Cartão de Débito',
  'debito',
  'Dinheiro',
  'dinheiro',
  'Vale Refeição',
  'vale refeição',
  'vale_refeicao',
  'Vale Alimentação',
  'vale alimentação',
  'vale_alimentacao',
];

export class ReceiveOrderDto {
  @ApiPropertyOptional({ example: 'PIX' })
  @IsString()
  @IsIn(ALLOWED_PAYMENT_METHODS, { message: 'Forma de pagamento inválida' })
  @IsOptional()
  paymentMethod?: string;

  @ApiPropertyOptional({ example: 'Online' })
  @IsString()
  @IsOptional()
  paymentType?: string;

  @ApiPropertyOptional({ example: 5.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  paymentDiscount?: number;

  @ApiPropertyOptional({ example: 2.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  installmentSurcharge?: number;

  @ApiPropertyOptional({ example: 10.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  couponDiscount?: number;

  @ApiPropertyOptional({ example: 15.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  couponFreightDiscount?: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  receiptDiscount?: number;

  @ApiPropertyOptional({ example: 0.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  receiptSurcharge?: number;

  @ApiProperty({ example: 150.0, required: true })
  @IsNumber()
  @Min(0)
  totalReceived: number;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @Min(1, { message: 'Número de parcelas deve ser no mínimo 1' })
  @Max(12, { message: 'Número de parcelas deve ser no máximo 12' })
  @IsOptional()
  installments?: number;

  @ApiPropertyOptional({ example: 4.5 })
  @IsNumber()
  @IsOptional()
  cardFee?: number;
}
