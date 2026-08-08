import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';

@ApiTags('Store Settings')
@Controller('store/settings')
export class StoreSettingsController {
  constructor(private readonly getSettingsUseCase: GetSettingsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Obter configurações públicas da loja (vitrine)' })
  @ApiResponse({ status: 200 })
  async getStoreSettings() {
    return this.getSettingsUseCase.execute();
  }

  @Get('status')
  @ApiOperation({ summary: 'Obter status atual da loja (aberta/fechada)' })
  @ApiResponse({ status: 200 })
  async getStoreStatus() {
    const settings = await this.getSettingsUseCase.execute();
    const businessHours = settings.businessHours || [];
    
    if (!businessHours || businessHours.length === 0) {
      return { isOpen: false };
    }

    // Usar fuso horário de Campo Grande (AMT)
    const nowStr = new Date().toLocaleString("en-US", {timeZone: "America/Campo_Grande"});
    const now = new Date(nowStr);
    
    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todayRule = businessHours.find((rule: any) => rule.days.includes(dayOfWeek));

    let isOpen = false;
    if (todayRule && todayRule.intervals.length > 0) {
      isOpen = todayRule.intervals.some((interval: any) => {
        const [openHour, openMin] = interval.open.split(":").map(Number);
        const [closeHour, closeMin] = interval.close.split(":").map(Number);
        const openMinutes = openHour * 60 + openMin;
        const closeMinutes = closeHour * 60 + closeMin;

        return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
      });
    }

    return { isOpen };
  }

  @Post('calculate-freight')
  @ApiOperation({ summary: 'Calcular frete para a vitrine' })
  async calculateFreight(@Body() body: { destination: string }) {
    // Retornando valor de mock para o frete, já que o supabase foi removido
    return {
      distanceKm: 5,
      freightPrice: 15,
    };
  }

  @Get('manifest.json')
  @ApiOperation({ summary: 'Obter manifest.json dinâmico para PWA' })
  async getManifest() {
    const settings = await this.getSettingsUseCase.execute();
    
    const minioUrl = process.env.MINIO_PUBLIC_URL || '';
    const bucket = process.env.MINIO_BUCKET || 'lojapod';
    
    // Função para montar a URL da imagem (apenas para paths relativos de minio)
    const buildImg = (path?: string | null) => {
      if (!path) return '';
      if (path.startsWith('http')) return path;
      if (path.startsWith('settings/')) return `${minioUrl}/${bucket}/${path}`;
      return path;
    };

    const iconSrc = buildImg(settings.faviconUrl) || '/favicon-512x512.png';

    return {
      name: settings.storeName || 'Loja Pod',
      short_name: settings.storeName || 'Loja',
      description: 'Painel Administrativo da loja',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      icons: [
        {
          src: iconSrc,
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: iconSrc,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    };
  }
}
