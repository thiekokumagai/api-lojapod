import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import sharp from 'sharp';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/infrastructure/decorators/current-user.decorator';
import type { JwtPayload } from '../../../auth/infrastructure/types/jwt-payload.type';
import { MinioService } from '../../../../minio/minio.service';
import { UploadedFile as UploadedFileType } from '../../../../common/types/uploaded-file.type';

import {
  maskPaymentGatewaysForAdmin,
  mergePaymentGatewaysOnUpdate,
} from '../../../payments/domain/utils/mercadopago-config';
import { UpdateSettingsDto } from '../dtos/update-settings.dto';
import { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';
import { UpdateSettingsUseCase } from '../../domain/use-cases/update-settings.use-case';

import { RequireWritePermissions } from '../../../auth/infrastructure/decorators/permissions.decorator';

function objectsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  for (const k of aKeys) {
    if (!objectsEqual(aObj[k], bObj[k])) return false;
  }
  return true;
}

function hasGatewayChanges(incoming: unknown, previous: unknown): boolean {
  if (incoming === undefined) return false;
  if (!incoming || typeof incoming !== 'object') return true;

  const prev = (
    previous && typeof previous === 'object' ? previous : {}
  ) as Record<string, unknown>;
  const merged = (
    mergePaymentGatewaysOnUpdate(incoming, previous) || {}
  ) as Record<string, unknown>;

  const allKeys = new Set([...Object.keys(merged), ...Object.keys(prev)]);
  for (const key of allKeys) {
    if (key === 'pixOnTerminal') continue;
    if (!objectsEqual(merged[key], prev[key])) {
      return true;
    }
  }
  return false;
}

@ApiTags('Settings')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('settings')
@RequireWritePermissions('settings', 'links')
export class SettingsController {
  constructor(
    private readonly getSettingsUseCase: GetSettingsUseCase,
    private readonly updateSettingsUseCase: UpdateSettingsUseCase,
    private readonly minioService: MinioService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Obter configurações da loja' })
  @ApiResponse({ status: 200 })
  async get(@CurrentUser() user?: JwtPayload) {
    const isStaff = user?.role === 'USER';
    const isAdmin = !isStaff;
    return this.withMaskedGateways(
      await this.getSettingsUseCase.execute(),
      isAdmin,
    );
  }

  /** O painel nunca recebe access token nem webhook secret do Mercado Pago. Não-admin não recebe ...Last4. */
  private withMaskedGateways<T>(settings: T, isAdmin = true): T {
    if (!settings || typeof settings !== 'object') return settings;
    const current = settings as { paymentGateways?: unknown };
    if (current.paymentGateways === undefined) return settings;
    return {
      ...settings,
      paymentGateways: maskPaymentGatewaysForAdmin(
        current.paymentGateways,
        isAdmin,
      ),
    };
  }

  @Put()
  @ApiOperation({ summary: 'Atualizar configurações da loja' })
  @ApiResponse({ status: 200 })
  async update(
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user?: JwtPayload,
  ) {
    const oldSettings = await this.getSettingsUseCase.execute();
    const isStaff = user?.role === 'USER';
    const isAdmin = !isStaff;
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';

    const currentBusinessType = oldSettings?.businessType ?? 'POD';
    const isChangingBusinessType =
      dto.businessType !== undefined && dto.businessType !== currentBusinessType;
    if ((isChangingBusinessType || dto.forceDisableCustomizations) && !isSuperAdmin) {
      throw new ForbiddenException(
        'Apenas super administradores podem alterar o segmento da loja',
      );
    }

    // Qualquer mudança em paymentGateways exige ADMIN ou SUPER_ADMIN
    if (!isAdmin && dto.paymentGateways !== undefined) {
      if (hasGatewayChanges(dto.paymentGateways, oldSettings?.paymentGateways)) {
        throw new ForbiddenException(
          'Apenas administradores podem alterar configurações de gateways de pagamento',
        );
      }
    }

    if (oldSettings) {
      // Check logo
      if (
        dto.logoUrl !== undefined &&
        dto.logoUrl !== oldSettings.logoUrl &&
        oldSettings.logoUrl
      ) {
        await this.minioService.deleteFile(oldSettings.logoUrl).catch(() => {});
      }

      // Check white logo
      if (
        dto.whiteLogoUrl !== undefined &&
        dto.whiteLogoUrl !== oldSettings.whiteLogoUrl &&
        oldSettings.whiteLogoUrl
      ) {
        await this.minioService.deleteFile(oldSettings.whiteLogoUrl).catch(() => {});
      }

      // Check favicon
      if (
        dto.faviconUrl !== undefined &&
        dto.faviconUrl !== oldSettings.faviconUrl &&
        oldSettings.faviconUrl
      ) {
        await this.minioService.deleteFile(oldSettings.faviconUrl).catch(() => {});
      }

      // Check banners
      if (dto.bannerUrls !== undefined && Array.isArray(oldSettings.bannerUrls)) {
        const newBanners = dto.bannerUrls || [];
        const removedBanners = oldSettings.bannerUrls.filter(
          (url) => !newBanners.includes(url),
        );
        for (const url of removedBanners) {
          await this.minioService.deleteFile(url).catch(() => {});
        }
      }

      // Check marketingLinks
      if (dto.marketingLinks !== undefined && Array.isArray(oldSettings.marketingLinks)) {
        const newLinks = dto.marketingLinks || [];
        const newImageUrls = newLinks.map((l: any) => l.imageUrl).filter(Boolean);
        const oldImageUrls = oldSettings.marketingLinks.map((l: any) => l.imageUrl).filter(Boolean);
        
        const removedImages = oldImageUrls.filter(
          (url) => !newImageUrls.includes(url),
        );
        for (const url of removedImages) {
          await this.minioService.deleteFile(url).catch(() => {});
        }
      }
    }

    // Segredo em branco mantém o já salvo; parcelas e campos do Mercado Pago são normalizados
    if (dto.paymentGateways !== undefined) {
      dto.paymentGateways = mergePaymentGatewaysOnUpdate(
        dto.paymentGateways,
        oldSettings?.paymentGateways,
      );
    }

    return this.withMaskedGateways(
      await this.updateSettingsUseCase.execute(dto),
      isAdmin,
    );
  }

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Fazer upload de mídia de configurações' })
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('Arquivo não enviado');
    }

    let buffer = file.buffer;
    if (file.mimetype.startsWith('image/')) {
      buffer = await sharp(file.buffer).webp({ quality: 90 }).toBuffer();
    }

    const upload = await this.minioService.uploadFile(
      {
        ...file,
        originalname: 'settings-media.webp',
        buffer,
        mimetype: 'image/webp',
      } as UploadedFileType,
      'settings',
    );

    return {
      url: upload.fileName,
      fileName: upload.fileName,
    };
  }

  @Post('upload/favicon')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Fazer upload do favicon da loja' })
  async uploadFavicon(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new Error('Arquivo não enviado');
    }

    const [icon192, icon512] = await Promise.all([
      sharp(file.buffer)
        .resize(192, 192, { fit: 'cover' })
        .png()
        .toBuffer(),
      sharp(file.buffer)
        .resize(512, 512, { fit: 'cover' })
        .png()
        .toBuffer(),
    ]);

    const timestamp = Date.now();
    const name192 = `pwa-icon-192-${timestamp}.png`;
    const name512 = `pwa-icon-512-${timestamp}.png`;

    const oldSettings = await this.getSettingsUseCase.execute();
    if (oldSettings?.faviconUrl) {
      const lastSlash = oldSettings.faviconUrl.lastIndexOf('/');
      const directory =
        lastSlash >= 0 ? oldSettings.faviconUrl.slice(0, lastSlash) : '';
      const old512 = oldSettings.faviconUrl.includes('192')
        ? oldSettings.faviconUrl.replace('192', '512')
        : '';

      const oldFiles = new Set([
        oldSettings.faviconUrl,
        old512,
        `${directory ? `${directory}/` : ''}pwa-icon-192.png`,
        `${directory ? `${directory}/` : ''}pwa-icon-512.png`,
      ].filter(Boolean));

      await Promise.all(
        [...oldFiles].map((path) =>
          this.minioService.deleteFile(path).catch(() => {}),
        ),
      );
    }

    const [upload192, upload512] = await Promise.all([
      this.minioService.uploadFile(
        {
          originalname: name192,
          customName: name192,
          buffer: icon192,
          size: icon192.length,
          mimetype: 'image/png',
        },
        'settings',
      ),
      this.minioService.uploadFile(
        {
          originalname: name512,
          customName: name512,
          buffer: icon512,
          size: icon512.length,
          mimetype: 'image/png',
        },
        'settings',
      ),
    ]);

    return {
      url: upload192.fileName,
      fileName: upload192.fileName,
      icon192: upload192.fileName,
      icon512: upload512.fileName,
    };
  }
}
