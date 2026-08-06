import { IsString, IsOptional, IsBoolean, IsArray } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateSettingsDto {
  @ApiProperty({ example: 'Pode Mais', required: false })
  @IsString()
  @IsOptional()
  storeName?: string;

  @ApiProperty({ example: 'https://cdn.example.com/logo.png', required: false })
  @IsString()
  @IsOptional()
  logoUrl?: string | null;

  @ApiProperty({ example: 'https://cdn.example.com/white-logo.png', required: false })
  @IsString()
  @IsOptional()
  whiteLogoUrl?: string | null;

  @ApiProperty({
    example: 'https://cdn.example.com/favicon.ico',
    required: false,
  })
  @IsString()
  @IsOptional()
  faviconUrl?: string | null;

  @ApiProperty({
    example: 'Frete grátis em compras acima de R$ 150!',
    required: false,
  })
  @IsString()
  @IsOptional()
  topHeaderText?: string | null;

  @ApiProperty({
    example: ['https://cdn.example.com/banner1.png'],
    required: false,
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  bannerUrls?: string[];

  @ApiProperty({ example: '(67) 99999-9999', required: false })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: '@podemais.cg', required: false })
  @IsString()
  @IsOptional()
  instagram?: string | null;

  @ApiProperty({ example: '123456789012345', required: false })
  @IsString()
  @IsOptional()
  pixelId?: string | null;

  @ApiProperty({ example: [], required: false })
  @IsOptional()
  @IsArray()
  marketingLinks?: any;

  // Endereço
  @ApiProperty({ example: '79002-075', required: false })
  @IsString()
  @IsOptional()
  cep?: string;

  @ApiProperty({ example: 'Rua 14 de Julho', required: false })
  @IsString()
  @IsOptional()
  street?: string;

  @ApiProperty({ example: '1234', required: false })
  @IsString()
  @IsOptional()
  number?: string;

  @ApiProperty({ example: 'Centro', required: false })
  @IsString()
  @IsOptional()
  neighborhood?: string;

  @ApiProperty({ example: 'Campo Grande', required: false })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiProperty({ example: 'MS', required: false })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiProperty({ example: 'Sala 3', required: false })
  @IsString()
  @IsOptional()
  complement?: string | null;

  @ApiProperty({ example: false, required: false })
  @IsBoolean()
  @IsOptional()
  hideAddress?: boolean;

  @ApiProperty({ example: '79002-075', required: false })
  @IsString()
  @IsOptional()
  deliveryOriginCep?: string | null;

  @ApiProperty({ example: '123A', required: false })
  @IsString()
  @IsOptional()
  deliveryOriginNumber?: string | null;

  @ApiProperty({ example: {}, required: false })
  @IsOptional()
  deliveryRanges?: any;

  @ApiProperty({ example: [], required: false })
  @IsOptional()
  @IsArray()
  installmentRules?: any;

  @ApiProperty({ example: [], required: false })
  @IsOptional()
  @IsArray()
  businessHours?: any;

  // Pagamentos
  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  pixEnabled?: boolean;

  @ApiProperty({ example: 'EMAIL', required: false })
  @IsString()
  @IsOptional()
  pixKeyType?: string | null;

  @ApiProperty({ example: 'podemais@email.com', required: false })
  @IsString()
  @IsOptional()
  pixKey?: string | null;

  @ApiProperty({ example: 'Pode Mais E-commerce LTDA', required: false })
  @IsString()
  @IsOptional()
  pixHolder?: string | null;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  payOnDeliveryCash?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  payOnDeliveryCardDebit?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  payOnDeliveryCardCredit?: boolean;

  @ApiProperty({ example: [], required: false })
  @IsOptional()
  @IsArray()
  paymentRules?: any;
}
