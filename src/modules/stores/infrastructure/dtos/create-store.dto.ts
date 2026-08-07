import { IsString, IsEmail, IsNotEmpty, Matches, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateStoreDto {
  @ApiProperty({ example: 'minhaloja', description: 'Subdomínio único da loja' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomínio deve conter apenas letras minúsculas, números e hífens',
  })
  subdomain: string;

  @ApiProperty({ example: 'Minha Loja Pod', description: 'Título / Nome da Loja' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ example: 'admin@minhaloja.com', description: 'E-mail do administrador da loja' })
  @IsEmail()
  @IsNotEmpty()
  adminEmail: string;

  @ApiProperty({ example: 'senha123', description: 'Senha inicial para o administrador da loja' })
  @IsString()
  @IsOptional()
  @MinLength(6)
  password?: string;
}
