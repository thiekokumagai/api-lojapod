import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCustomerDto {
  @ApiProperty({
    example: 'João da Silva',
    description: 'Nome do cliente',
    required: false,
  })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({
    example: '11999999999',
    description: 'Telefone do cliente',
    required: false,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({
    example: false,
    description: 'Flag para indicar se o cliente está na block list',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isBlocked?: boolean;
}
