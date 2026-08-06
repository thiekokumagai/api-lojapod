import { IsNumber, IsString, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterPurchaseDto {
  @ApiProperty({
    description: 'Valor gasto com produtos/fornecedores',
    example: 1500,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Descrição da compra',
    example: 'Compra de 50 camisetas com fornecedor X',
  })
  @IsString()
  @IsNotEmpty()
  description: string;
}
