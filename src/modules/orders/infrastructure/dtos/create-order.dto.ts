import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsEnum,
  IsArray,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus, PaymentStatus } from '../../domain/entities/order.entity';
import { CreateOrderItemDto } from './create-order-item.dto';

export class CreateOrderDto {
  @ApiProperty({ example: 'João da Silva', description: 'Nome do cliente' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({
    example: '11999999999',
    description: 'Telefone de contato do cliente',
  })
  @IsString()
  @IsNotEmpty()
  customerPhone: string;

  @ApiPropertyOptional({
    example: 'e6a9e0d2-3698-429e-bee5-717771320af2',
    description: 'ID do cliente vinculado ao pedido',
  })
  @IsString()
  @IsOptional()
  customerId?: string;

  @ApiProperty({ example: 150.0, description: 'Valor total dos itens' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  itemsTotal: number;

  @ApiProperty({ example: 15.0, description: 'Valor do frete' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  freight: number;

  @ApiPropertyOptional({
    example: 5.0,
    description: 'Desconto de forma de pagamento',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  paymentDiscount?: number;

  @ApiPropertyOptional({
    example: 2.0,
    description: 'Acréscimo de parcelamento',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  installmentSurcharge?: number;

  @ApiPropertyOptional({ example: 10.0, description: 'Desconto do cupom' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  couponDiscount?: number;

  @ApiPropertyOptional({ example: 100.0, description: 'Total sem promoção' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  nonPromoItemsTotal?: number;

  @ApiPropertyOptional({
    example: 15.0,
    description: 'Desconto de frete pelo cupom',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  couponFreightDiscount?: number;

  @ApiPropertyOptional({ example: 0.0, description: 'Desconto no recebimento' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  receiptDiscount?: number;

  @ApiPropertyOptional({
    example: 0.0,
    description: 'Acréscimo no recebimento',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  receiptSurcharge?: number;

  @ApiPropertyOptional({ description: 'Regra de taxa aplicada' })
  @IsOptional()
  appliedTaxRule?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Regra de cupom aplicada' })
  @IsOptional()
  appliedCouponRule?: Record<string, any>;

  @ApiProperty({
    example: 155.0,
    description: 'Valor total do pedido (itens + frete - desconto)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalOrder: number;

  @ApiProperty({ example: 155.0, description: 'Valor total recebido' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  totalReceived: number;

  @ApiProperty({ example: 'Na Entrega', description: 'Tipo de pagamento' })
  @IsString()
  @IsNotEmpty()
  paymentType: string;

  @ApiProperty({ example: 'Dinheiro', description: 'Método de pagamento' })
  @IsString()
  @IsNotEmpty()
  paymentMethod: string;

  @ApiPropertyOptional({
    example: '11999999999',
    description: 'Chave PIX se o pagamento for PIX',
  })
  @IsString()
  @IsOptional()
  pixKey?: string;

  @ApiProperty({
    example: 'Rua das Flores',
    description: 'Endereço de entrega',
  })
  @IsString()
  @IsNotEmpty()
  street: string;

  @ApiProperty({ example: '123', description: 'Número do endereço de entrega' })
  @IsString()
  @IsNotEmpty()
  number: string;

  @ApiProperty({ example: 'Centro', description: 'Bairro de entrega' })
  @IsString()
  @IsNotEmpty()
  neighborhood: string;

  @ApiProperty({ example: 'São Paulo', description: 'Cidade de entrega' })
  @IsString()
  @IsNotEmpty()
  city: string;

  @ApiProperty({ example: 'SP', description: 'Estado de entrega' })
  @IsString()
  @IsNotEmpty()
  state: string;

  @ApiProperty({ example: '01001000', description: 'CEP de entrega' })
  @IsString()
  @IsNotEmpty()
  cep: string;

  @ApiPropertyOptional({
    example: 'Apto 42',
    description: 'Complemento do endereço de entrega',
  })
  @IsString()
  @IsOptional()
  complement?: string;

  @ApiPropertyOptional({
    example: 'Entregar na portaria',
    description: 'Observação do pedido',
  })
  @IsString()
  @IsOptional()
  observation?: string;

  @ApiPropertyOptional({
    example: OrderStatus.PENDING,
    enum: OrderStatus,
    description: 'Status inicial do pedido',
  })
  @IsEnum(OrderStatus)
  @IsOptional()
  status?: OrderStatus;

  @ApiPropertyOptional({
    example: PaymentStatus.PENDING,
    enum: PaymentStatus,
    description: 'Status de pagamento do pedido',
  })
  @IsEnum(PaymentStatus)
  @IsOptional()
  paymentStatus?: PaymentStatus;

  @ApiPropertyOptional({ example: 1, description: 'Número de parcelas' })
  @IsNumber()
  @Min(1)
  @IsOptional()
  installments?: number;

  @ApiProperty({
    type: [CreateOrderItemDto],
    description: 'Itens inclusos no pedido',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];

  @ApiPropertyOptional({
    example: 'PROMO10',
    description: 'Título do cupom aplicado',
  })
  @IsString()
  @IsOptional()
  couponTitle?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Mostrar preço dos produtos na impressão',
  })
  @IsBoolean()
  @IsOptional()
  showProductPrices?: boolean;

  @ApiPropertyOptional({
    example: 100.00,
    description: 'Valor em dinheiro fornecido pelo cliente',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  amountProvided?: number;

  @ApiPropertyOptional({
    example: 15.50,
    description: 'Troco a ser devolvido',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  changeAmount?: number;
}
