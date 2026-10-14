import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ManualAdjustStampDto {
  @IsNotEmpty()
  @IsString()
  customerPhone: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsNotEmpty()
  @IsInt()
  stampsCount: number; // Pode ser positivo (adicionar) ou negativo (subtrair)

  @IsOptional()
  @IsString()
  reason?: string;
}
