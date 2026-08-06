import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class UpdateCustomerAddressDto {
  @ApiPropertyOptional({ example: 'Rua Principal' })
  @IsString()
  @IsOptional()
  street?: string;

  @ApiPropertyOptional({ example: '123' })
  @IsString()
  @IsOptional()
  number?: string;

  @ApiPropertyOptional({ example: 'Centro' })
  @IsString()
  @IsOptional()
  neighborhood?: string;

  @ApiPropertyOptional({ example: 'São Paulo' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ example: '01001-000' })
  @IsString()
  @IsOptional()
  cep?: string;

  @ApiPropertyOptional({ example: 'Apto 12' })
  @IsString()
  @IsOptional()
  complement?: string;
}
