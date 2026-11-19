import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/** Filtros comuns dos relatórios; cada relatório usa só os que fazem sentido para ele. */
export class ReportFiltersDto {
  @ApiPropertyOptional({ example: '2026-11-01', description: 'Início (YYYY-MM-DD, fuso da loja). Sem datas: hoje.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'startDate deve estar no formato YYYY-MM-DD' })
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-11-30', description: 'Fim (YYYY-MM-DD, fuso da loja).' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'endDate deve estar no formato YYYY-MM-DD' })
  endDate?: string;

  @ApiPropertyOptional({ description: 'Só produtos/boxes desta categoria (relatório de produtos).' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  @ApiPropertyOptional({ example: 'pix', description: 'Forma de pagamento (pix, credit, debit, cash...).' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  paymentMethod?: string;

  @ApiPropertyOptional({ enum: ['DELIVERY', 'STORE_PICKUP'] })
  @IsOptional()
  @IsIn(['DELIVERY', 'STORE_PICKUP'])
  deliveryModality?: string;

  @ApiPropertyOptional({
    enum: ['PENDING', 'CONFIRMED', 'DISPATCHED', 'COMPLETED', 'CANCELLED'],
    description: 'Sem valor: todos os pedidos, menos os cancelados.',
  })
  @IsOptional()
  @IsIn(['PENDING', 'CONFIRMED', 'DISPATCHED', 'COMPLETED', 'CANCELLED'])
  status?: 'PENDING' | 'CONFIRMED' | 'DISPATCHED' | 'COMPLETED' | 'CANCELLED';

  @ApiPropertyOptional({ enum: ['PAID', 'PENDING'] })
  @IsOptional()
  @IsIn(['PAID', 'PENDING'])
  paymentStatus?: 'PAID' | 'PENDING';

  @ApiPropertyOptional({ description: 'Produtos parados: dias sem vender (7 a 365). Padrão 30.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  idleDays?: number;
}
