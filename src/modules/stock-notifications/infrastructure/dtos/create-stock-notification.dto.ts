import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStockNotificationDto {
  @ApiProperty({ description: 'ID do produto' })
  @IsString()
  @IsNotEmpty()
  productId: string;

  @ApiProperty({ description: 'ID da variação/item (opcional)', required: false })
  @IsString()
  @IsOptional()
  productItemId?: string;

  @ApiProperty({ description: 'Nome do cliente' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ description: 'WhatsApp / Telefone do cliente' })
  @IsString()
  @IsNotEmpty()
  customerPhone: string;
}
