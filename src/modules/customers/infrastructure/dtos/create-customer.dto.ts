import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({
    example: 'João da Silva',
    description: 'Nome do cliente',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: '(11) 99999-9999',
    description: 'Telefone do cliente',
  })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiProperty({
    example: false,
    description: 'Flag para indicar se o cliente está na block list',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isBlocked?: boolean;
}
