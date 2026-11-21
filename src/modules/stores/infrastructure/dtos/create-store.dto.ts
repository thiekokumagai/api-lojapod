import { IsString, IsEmail, IsNotEmpty, Matches, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStoreDto {
  @ApiPropertyOptional({ example: 'minhaloja', description: 'Subdomínio único da loja' })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomínio deve conter apenas letras minúsculas, números e hífens',
  })
  subdomain?: string;

  @ApiProperty({ example: 'Minha Loja Podi Pedir', description: 'Título / Nome da Loja' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'admin@minhaloja.com', description: 'E-mail do administrador da loja' })
  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @ApiPropertyOptional({ example: '11999999999', description: 'Telefone / WhatsApp da loja' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: 'senha123', description: 'Senha inicial para o administrador da loja' })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;

  @ApiPropertyOptional({
    example: 'POD',
    enum: ['POD', 'FOOD', 'ACAI'],
    description: 'Segmento da loja (somente Super Admin)',
  })
  @IsIn(['POD', 'FOOD', 'ACAI'])
  @IsOptional()
  businessType?: 'POD' | 'FOOD' | 'ACAI';
}
