import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PayFixedCostDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  cashRegisterId?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
