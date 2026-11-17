import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class MercadoPagoIdentificationDto {
  @IsString()
  @MaxLength(10)
  type: string;

  @IsString()
  @MaxLength(30)
  number: string;
}

/**
 * Dados do cartão NUNCA passam por aqui: o navegador troca o cartão por um `token` direto no Mercado Pago.
 * O valor da cobrança também não vem daqui, só do pedido gravado no servidor.
 */
export class MercadoPagoCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  token: string;

  @IsInt()
  @Min(1)
  @Max(12)
  installments: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  paymentMethodId: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  issuerId?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(120)
  payerEmail?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MercadoPagoIdentificationDto)
  identification?: MercadoPagoIdentificationDto;
}
