import { Controller, Get, Post, Body, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { TenantContextService } from '../../../tenant/tenant-context.service';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { getTimezoneFromCepOrState } from '../../../../common/utils/date.utils';
import { toPublicMercadoPago } from '../../../payments/domain/utils/mercadopago-config';

/**
 * Caminho do ícone de 512 a partir do de 192 salvo em faviconUrl. Troca só o nome do arquivo
 * (pwa-icon-192 → pwa-icon-512), para não mexer num "192" que apareça no id da pasta.
 */
export function toIcon512Path(path: string): string {
  const slash = path.lastIndexOf('/');
  const dir = path.slice(0, slash + 1);
  const file = path.slice(slash + 1);
  if (/192/.test(file)) return dir + file.replace(/192/, '512');
  return path;
}

@ApiTags('Store Settings')
@Controller('store/settings')
export class StoreSettingsController {
  constructor(
    private readonly getSettingsUseCase: GetSettingsUseCase,
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obter configurações públicas da loja (vitrine)' })
  @ApiResponse({ status: 200 })
  async getStoreSettings() {
    const settings = await this.getSettingsUseCase.execute();
    if (!settings) return settings;

    // Sanitizar credenciais sensíveis de gateways de pagamento para a vitrine pública
    const rawGateways = settings.paymentGateways as any;
    const publicGateways: any = {};
    // Pix na maquininha: o cliente não recebe chave, titular nem copia e cola
    const pixOnTerminal = rawGateways?.pixOnTerminal === true;

    if (rawGateways && typeof rawGateways === 'object') {
      if (pixOnTerminal) {
        publicGateways.pixOnTerminal = true;
      }
      if (rawGateways.infinitepay) {
        publicGateways.infinitepay = {
          enabled: !!rawGateways.infinitepay.enabled,
          acceptCreditCard: !!rawGateways.infinitepay.acceptCreditCard,
        };
      }
      if (rawGateways.mercadopago) {
        // Só o que a vitrine precisa: a public key vai ao navegador; access token e webhook secret nunca
        publicGateways.mercadopago = toPublicMercadoPago(rawGateways);
      }
      if (rawGateways.asaas) {
        publicGateways.asaas = {
          enabled: !!rawGateways.asaas.enabled,
          acceptCreditCard: !!rawGateways.asaas.acceptCreditCard,
        };
      }
    }

    return {
      ...settings,
      businessType: settings.businessType ?? 'POD',
      ...(pixOnTerminal
        ? { pixKey: null, pixKeyType: null, pixHolder: null }
        : {}),
      vendizapAuthSecret: undefined,
      paymentGateways: publicGateways,
    };
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

    // Identificar fuso horário pelo CEP ou Estado da loja
    const timeZone = getTimezoneFromCepOrState(
      settings.deliveryOriginCep || settings.cep,
      settings.state,
    );

    const nowStr = new Date().toLocaleString('en-US', {
      timeZone,
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

  /**
   * Manifest do app instalável do admin, com nome e ícone da loja.
   *
   * - `?storeId=`: o admin roda num domínio só para todas as lojas (admin.lojapod.com /
   *   admin.podipedir.com.br), então o tenant não sai do host. O navegador busca o manifest
   *   sem token, por isso a loja logada vem na query. Só expõe nome e ícone (dados já públicos).
   * - start_url/scope usam o domínio que pediu (Origin): o navegador só instala se forem do
   *   mesmo domínio da página. ADMIN_FRONTEND_URL fica como reserva.
   */
  @Get('manifest.json')
  @Public()
  @ApiOperation({ summary: 'Obter manifest.json dinâmico para PWA' })
  async getManifest(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query('storeId') storeIdParam?: string,
  ) {
    const fallback = { storeName: 'Podi Pedir', faviconUrl: null };
    let settings: any = null;
    try {
      settings = await this.loadSettingsForManifest(storeIdParam);
    } catch (e) {
      settings = null;
    }
    settings = settings || fallback;

    const minioUrl = process.env.MINIO_PUBLIC_URL || '';
    const bucket = process.env.MINIO_BUCKET || 'lojapod';
    const originHeader = req.headers?.origin;
    const adminOrigin = (
      (typeof originHeader === 'string' && /^https?:\/\//i.test(originHeader)
        ? originHeader
        : '') ||
      process.env.ADMIN_FRONTEND_URL ||
      ''
    ).replace(/\/$/, '');
    // A resposta muda conforme o domínio e a loja: cache não pode misturar.
    res.setHeader('Vary', 'Origin');

    const buildImg = (path?: string | null) => {
      if (!path) return '';
      if (path.startsWith('http')) return path;
      return `${minioUrl}/${bucket}/${path.replace(/^\//, '')}`;
    };

    // Ícones padrão do admin (sem ícone da loja).
    let icon192Src = `${adminOrigin}/favicon-192x192.png`;
    let icon512Src = `${adminOrigin}/favicon-512x512.png`;

    if (settings.faviconUrl) {
      // O upload do favicon gera pwa-icon-192-<ts>.png e pwa-icon-512-<ts>.png (PNG quadrado).
      icon192Src = buildImg(settings.faviconUrl);
      icon512Src = buildImg(toIcon512Path(settings.faviconUrl));
    }

    const cleanStoreName =
      settings.storeName && !/^loja\s*pod$/i.test(String(settings.storeName).trim())
        ? settings.storeName
        : 'Podi Pedir';

    return {
      id: '/',
      name: cleanStoreName,
      short_name: cleanStoreName,
      description: 'Painel Administrativo da loja',
      lang: 'pt-BR',
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: `${adminOrigin}/`,
      scope: `${adminOrigin}/`,
      icons: [
        { src: icon192Src, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: icon512Src, sizes: '512x512', type: 'image/png', purpose: 'any' },
      ],
    };
  }

  /** Settings da loja pedida por id (admin) ou, sem id, da loja resolvida pelo host. */
  private async loadSettingsForManifest(storeIdParam?: string) {
    const storeId = typeof storeIdParam === 'string' ? storeIdParam.trim() : '';
    if (!storeId || !/^[A-Za-z0-9_-]{8,64}$/.test(storeId)) {
      return this.getSettingsUseCase.execute();
    }
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, subdomain: true, isActive: true },
    });
    if (!store) return null;
    return this.tenantContextService.run(
      { storeId: store.id, subdomain: store.subdomain ?? undefined, isActive: store.isActive },
      () => this.getSettingsUseCase.execute(),
    );
  }
}
