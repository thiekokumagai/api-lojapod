import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';

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
    const nowStr = new Date().toLocaleString('en-US', {
      timeZone: 'America/Campo_Grande',
    });
    const now = new Date(nowStr);

    const dayOfWeek = now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const todayRule = businessHours.find((rule: any) =>
      rule.days.includes(dayOfWeek),
    );

    let isOpen = false;
    if (todayRule && todayRule.intervals.length > 0) {
      isOpen = todayRule.intervals.some((interval: any) => {
        const [openHour, openMin] = interval.open.split(':').map(Number);
        const [closeHour, closeMin] = interval.close.split(':').map(Number);
        const openTotal = openHour * 60 + openMin;
        const closeTotal = closeHour * 60 + closeMin;
        return currentMinutes >= openTotal && currentMinutes < closeTotal;
      });
    }

    return { isOpen };
  }

  @Post('calculate-freight')
  @ApiOperation({ summary: 'Calcular frete para a vitrine' })
  async calculateFreight(@Body() body: { destination: string }) {
    return {
      distanceKm: 5,
      freightPrice: 15,
    };
  }

  @Get('manifest.json')
  @Public()
  @ApiOperation({ summary: 'Obter manifest.json dinâmico para PWA' })
  async getManifest() {
    let settings: any = null;
    try {
      settings = await this.getSettingsUseCase.execute();
    } catch (e) {
      settings = { storeName: 'LojaPod', faviconUrl: null };
    }

    const minioUrl = process.env.MINIO_PUBLIC_URL || '';
    const bucket = process.env.MINIO_BUCKET || 'lojapod';
    const adminFrontendUrl = (process.env.ADMIN_FRONTEND_URL || '').replace(
      /\/$/,
      '',
    );

    // Função para montar a URL da imagem (apenas para paths relativos de minio)

    // Função para montar a URL da imagem (apenas para paths relativos de minio)
    const buildImg = (path?: string | null) => {
      if (!path) return '';
      if (path.startsWith('http')) return path;
      return `${minioUrl}/${bucket}/${path.replace(/^\//, '')}`;
    };

    let icon192Src = adminFrontendUrl
      ? `${adminFrontendUrl}/favicon-192x192.png`
      : '/favicon-192x192.png';
    let icon512Src = adminFrontendUrl
      ? `${adminFrontendUrl}/favicon-512x512.png`
      : '/favicon-512x512.png';

    if (settings.faviconUrl) {
      if (settings.faviconUrl.startsWith('http')) {
        icon192Src = settings.faviconUrl;
        icon512Src = settings.faviconUrl;
      } else {
        icon192Src = buildImg(settings.faviconUrl);
        const icon512Path = settings.faviconUrl.includes('192')
          ? settings.faviconUrl.replace('192', '512')
          : settings.faviconUrl;
        icon512Src = buildImg(icon512Path);
      }
    }

    return {
      name: settings.storeName || 'Loja Pod',
      short_name: settings.storeName || 'Loja Pod',
      description: 'Painel Administrativo da loja',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: `${adminFrontendUrl}/`,
      scope: `${adminFrontendUrl}/`,
      icons: [
        {
          src: icon192Src,
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: icon512Src,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ],
    };
  }
}
