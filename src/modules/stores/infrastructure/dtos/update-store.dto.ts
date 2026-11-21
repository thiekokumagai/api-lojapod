import {
  IsString,
  IsEmail,
  IsOptional,
  IsIn,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStoreDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  subdomain?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  customDomain?: string | null;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  adminEmail?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  password?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  subscriptionExpiresAt?: string;

  @ApiPropertyOptional()
  @IsNumber()
  @IsOptional()
  monthlyFee?: number;

  @ApiPropertyOptional({
    example: 'POD',
    enum: ['POD', 'FOOD', 'ACAI'],
    description: 'Segmento da loja (somente Super Admin)',
  })
  @IsIn(['POD', 'FOOD', 'ACAI'])
  @IsOptional()
  businessType?: 'POD' | 'FOOD' | 'ACAI';

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  forceDisableCustomizations?: boolean;
}
