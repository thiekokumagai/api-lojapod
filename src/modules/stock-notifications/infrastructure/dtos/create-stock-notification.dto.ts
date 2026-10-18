import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStockNotificationDto {
  @ApiProperty({ description: 'ID do produto (opcional se for combo)', required: false })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiProperty({ description: 'ID da variação/item (opcional)', required: false })
  @IsString()
  @IsOptional()
  productItemId?: string;

  @ApiProperty({ description: 'ID do combo (opcional se for produto)', required: false })
  @IsString()
  @IsOptional()
  comboId?: string;

  @ApiProperty({ description: 'Nome do cliente' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ description: 'WhatsApp / Telefone do cliente' })
  @IsString()
  @IsNotEmpty()
  customerPhone: string;
}
