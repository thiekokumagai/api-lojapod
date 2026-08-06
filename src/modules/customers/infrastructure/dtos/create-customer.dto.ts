import { IsString, IsNotEmpty } from 'class-validator';
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
}
