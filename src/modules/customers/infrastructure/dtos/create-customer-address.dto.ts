import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomerAddressDto {
  @ApiProperty({ example: '01001-000', description: 'CEP do endereço' })
  @IsString()
  @IsNotEmpty({ message: 'O CEP é obrigatório' })
  cep: string;

  @ApiProperty({ example: 'Praça da Sé', description: 'Logradouro' })
  @IsString()
  @IsNotEmpty({ message: 'A rua/logradouro é obrigatória' })
  street: string;

  @ApiProperty({ example: 's/n', description: 'Número do local' })
  @IsString()
  @IsNotEmpty({ message: 'O número é obrigatório' })
  number: string;

  @ApiProperty({ example: 'Sé', description: 'Bairro' })
  @IsString()
  @IsNotEmpty({ message: 'O bairro é obrigatório' })
  neighborhood: string;

  @ApiProperty({ example: 'São Paulo', description: 'Cidade' })
  @IsString()
  @IsNotEmpty({ message: 'A cidade é obrigatória' })
  city: string;

  @ApiProperty({ example: 'SP', description: 'Sigla do Estado' })
  @IsString()
  @IsNotEmpty({ message: 'O estado é obrigatório' })
  state: string;

  @ApiProperty({
    example: 'Lado ímpar',
    description: 'Complemento do endereço',
    required: false,
  })
  @IsString()
  @IsOptional()
  complement?: string;

  @ApiProperty({
    example: true,
    description: 'Define se este será o endereço principal do cliente',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
