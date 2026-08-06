import { IsString, IsNumber, IsNotEmpty, IsIn } from 'class-validator';

export class CreateCashTransactionDto {
  @IsNotEmpty()
  @IsString()
  cashRegisterId: string;

  @IsNotEmpty()
  @IsString()
  @IsIn(['ENTRY', 'OUTFLOW'])
  type: string;

  @IsNotEmpty()
  @IsNumber()
  amount: number;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsString()
  category?: string;
}
