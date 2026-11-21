import { ConflictException, ForbiddenException } from '@nestjs/common';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SettingsController } from './settings.controller';
import { UpdateSettingsUseCase } from '../../domain/use-cases/update-settings.use-case';
import { UpdateSettingsDto } from '../dtos/update-settings.dto';
import type { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';
import type { ISettingsRepository } from '../../domain/repositories/isettings.repository';
import type { MinioService } from '../../../../minio/minio.service';
import type { JwtPayload } from '../../../auth/infrastructure/types/jwt-payload.type';

describe('Troca de segmento (businessType) — SettingsController + UpdateSettingsUseCase', () => {
  const superAdminUser: JwtPayload = {
    sub: 'super-1',
    email: 'super@lojapod.com',
    role: 'SUPER_ADMIN',
    storeId: 'store-1',
  };

  const adminUser: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@lojapod.com',
    role: 'ADMIN',
    storeId: 'store-1',
  };

  const setup = (opts?: {
    currentBusinessType?: 'POD' | 'FOOD' | 'ACAI';
    customizableCount?: number;
  }) => {
    const currentSettings: any = {
      id: 'settings-1',
      storeName: 'Loja Demo',
      businessType: opts?.currentBusinessType ?? 'POD',
      bannerUrls: [],
      phone: '67999999999',
      cep: '79000000',
      street: 'Rua A',
      number: '10',
      neighborhood: 'Centro',
      city: 'Campo Grande',
      state: 'MS',
      hideAddress: false,
      pixEnabled: true,
      payOnDeliveryCash: true,
      payOnDeliveryCardDebit: true,
      payOnDeliveryCardCredit: true,
      payOnDeliveryMealVoucher: false,
      payOnDeliveryFoodVoucher: false,
      paymentRules: [],
      paymentGateways: {},
    };

    const repo: jest.Mocked<ISettingsRepository> = {
      get: jest.fn().mockResolvedValue(currentSettings),
      countCustomizableProducts: jest
        .fn()
        .mockResolvedValue(opts?.customizableCount ?? 0),
      save: jest.fn().mockImplementation(async (payload) => ({
        ...currentSettings,
        ...payload,
      })),
    };

    const getUseCase = {
      execute: jest.fn().mockResolvedValue(currentSettings),
    } as unknown as GetSettingsUseCase;

    const updateUseCase = new UpdateSettingsUseCase(repo);
    const minioService = {
      deleteFile: jest.fn().mockResolvedValue(undefined),
    } as unknown as MinioService;

    const controller = new SettingsController(
      getUseCase,
      updateUseCase,
      minioService,
    );

    return { controller, repo };
  };

  it('super admin troca segmento de POD para FOOD com sucesso', async () => {
    const { controller, repo } = setup({ currentBusinessType: 'POD' });

    const res = await controller.update(
      { businessType: 'FOOD' } as UpdateSettingsDto,
      superAdminUser,
    );

    expect(res.businessType).toBe('FOOD');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ businessType: 'FOOD' }),
      { disableCustomizableProducts: false },
    );
  });

  it('admin comum recebe 403 ao tentar alterar businessType', async () => {
    const { controller, repo } = setup({ currentBusinessType: 'POD' });

    await expect(
      controller.update(
        { businessType: 'ACAI' } as UpdateSettingsDto,
        adminUser,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('admin comum pode salvar outras configurações mantendo businessType atual', async () => {
    const { controller, repo } = setup({ currentBusinessType: 'FOOD' });

    const res = await controller.update(
      { storeName: 'Marmitaria Nova', businessType: 'FOOD' } as UpdateSettingsDto,
      adminUser,
    );

    expect(res.storeName).toBe('Marmitaria Nova');
    expect(res.businessType).toBe('FOOD');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        storeName: 'Marmitaria Nova',
        businessType: 'FOOD',
      }),
      { disableCustomizableProducts: false },
    );
  });

  it('troca para POD com produtos personalizáveis bloqueia (409) sem forceDisableCustomizations', async () => {
    const { controller, repo } = setup({
      currentBusinessType: 'FOOD',
      customizableCount: 3,
    });

    try {
      await controller.update(
        { businessType: 'POD' } as UpdateSettingsDto,
        superAdminUser,
      );
      fail('Deveria lançar ConflictException');
    } catch (err: any) {
      expect(err).toBeInstanceOf(ConflictException);
      expect(err.getResponse()).toEqual(
        expect.objectContaining({
          code: 'CUSTOMIZABLE_PRODUCTS_EXIST',
          customizableProductsCount: 3,
        }),
      );
    }
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('troca para POD com forceDisableCustomizations: true desmarca produtos da loja e salva POD', async () => {
    const { controller, repo } = setup({
      currentBusinessType: 'ACAI',
      customizableCount: 4,
    });

    const res = await controller.update(
      {
        businessType: 'POD',
        forceDisableCustomizations: true,
      } as UpdateSettingsDto,
      superAdminUser,
    );

    expect(res.businessType).toBe('POD');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ businessType: 'POD' }),
      { disableCustomizableProducts: true },
    );
  });

  it('DTO rejeita businessType fora de POD | FOOD | ACAI', async () => {
    const dto = plainToInstance(UpdateSettingsDto, {
      businessType: 'INVALIDO',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'businessType')).toBe(true);
  });
});
