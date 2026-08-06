import { IsNumber, IsString, IsOptional, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddInvestmentDto {
  @ApiProperty({
    description: 'Valor do investimento transferido do caixa',
    example: 5000,
  })
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty({
    description: 'Descrição opcional',
    example: 'Transferência para Investimento',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;
}
