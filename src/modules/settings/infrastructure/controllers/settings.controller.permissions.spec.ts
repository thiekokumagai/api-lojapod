import { ForbiddenException } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import type { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';
import type { UpdateSettingsUseCase } from '../../domain/use-cases/update-settings.use-case';
import type { MinioService } from '../../../../minio/minio.service';
import type { JwtPayload } from '../../../auth/infrastructure/types/jwt-payload.type';
import type { UpdateSettingsDto } from '../dtos/update-settings.dto';

interface GatewaysResult {
  paymentGateways?: {
    mercadopago?: {
      accessTokenSet?: boolean;
      accessTokenLast4?: string | null;
      webhookSecretSet?: boolean;
      webhookSecretLast4?: string | null;
      publicKey?: string;
      enabled?: boolean;
    };
    infinitepay?: {
      apiKeySet?: boolean;
      apiKeyLast4?: string | null;
      enabled?: boolean;
    };
    asaas?: {
      apiKeySet?: boolean;
      apiKeyLast4?: string | null;
    };
  };
}

describe('SettingsController: permissões de gateways (funcionário vs admin)', () => {
  const savedSettings = {
    id: 'store-1',
    marketingLinks: [],
    paymentGateways: {
      mercadopago: {
        enabled: false,
        acceptPix: true,
        acceptCreditCard: true,
        publicKey: 'TEST-public-key-12345',
        accessToken: 'APP_USR-1111222233334444-token-9876', // > 20 chars
        webhookSecret: 'whsec_abcdefghijkl7777', // > 20 chars
        maxInstallments: 6,
        pixExpirationMinutes: 30,
      },
      infinitepay: {
        enabled: false,
        acceptCreditCard: true,
        handle: 'loja-x',
        apiKey: 'inchk_1234567890abcdef', // > 20 chars
        assuredInstallments: 1,
      },
    },
  };

  const staffUser: JwtPayload = {
    sub: 'staff-1',
    email: 'funcionario@loja.com',
    role: 'USER',
    storeId: 'store-1',
  };

  const adminUser: JwtPayload = {
    sub: 'admin-1',
    email: 'admin@loja.com',
    role: 'ADMIN',
    storeId: 'store-1',
  };

  function setup() {
    let current: Record<string, unknown> = { ...savedSettings };
    const getUseCase = {
      execute: jest.fn().mockImplementation(() => Promise.resolve(current)),
    };
    const updateUseCase = {
      execute: jest.fn().mockImplementation((dto: UpdateSettingsDto) => {
        current = { ...current, ...(dto as Record<string, unknown>) };
        return Promise.resolve(current);
      }),
    };
    const controller = new SettingsController(
      getUseCase as unknown as GetSettingsUseCase,
      updateUseCase as unknown as UpdateSettingsUseCase,
      {} as MinioService,
    );
    return { controller, updateUseCase };
  }

  describe('GET /settings', () => {
    it('funcionário (não-admin) NÃO vê segredos nem Last4, apenas ...Set', async () => {
      const { controller } = setup();
      const res = (await controller.get(staffUser)) as unknown as {
        paymentGateways?: {
          mercadopago?: Record<string, unknown>;
          infinitepay?: Record<string, unknown>;
        };
      };

      expect(res.paymentGateways?.mercadopago?.accessTokenSet).toBe(true);
      expect(res.paymentGateways?.mercadopago?.webhookSecretSet).toBe(true);
      expect(res.paymentGateways?.mercadopago?.accessToken).toBeUndefined();
      expect(res.paymentGateways?.mercadopago?.webhookSecret).toBeUndefined();
      expect(
        res.paymentGateways?.mercadopago?.accessTokenLast4,
      ).toBeUndefined();
      expect(
        res.paymentGateways?.mercadopago?.webhookSecretLast4,
      ).toBeUndefined();

      expect(res.paymentGateways?.infinitepay?.apiKeySet).toBe(true);
      expect(res.paymentGateways?.infinitepay?.apiKey).toBeUndefined();
      expect(res.paymentGateways?.infinitepay?.apiKeyLast4).toBeUndefined();
    });

    it('admin vê os segredos completos e os Last4 salvos', async () => {
      const { controller } = setup();
      const res = (await controller.get(adminUser)) as unknown as {
        paymentGateways?: {
          mercadopago?: Record<string, unknown>;
          infinitepay?: Record<string, unknown>;
        };
      };

      expect(res.paymentGateways?.mercadopago?.accessToken).toBe(
        'APP_USR-1111222233334444-token-9876',
      );
      expect(res.paymentGateways?.mercadopago?.webhookSecret).toBe(
        'whsec_abcdefghijkl7777',
      );
      expect(res.paymentGateways?.mercadopago?.accessTokenSet).toBe(true);
      expect(res.paymentGateways?.mercadopago?.accessTokenLast4).toBe('9876');
      expect(res.paymentGateways?.mercadopago?.webhookSecretSet).toBe(true);
      expect(res.paymentGateways?.mercadopago?.webhookSecretLast4).toBe('7777');

      expect(res.paymentGateways?.infinitepay?.apiKey).toBe(
        'inchk_1234567890abcdef',
      );
      expect(res.paymentGateways?.infinitepay?.apiKeySet).toBe(true);
      expect(res.paymentGateways?.infinitepay?.apiKeyLast4).toBe('cdef');
    });
  });

  describe('PUT /settings', () => {
    it('funcionário não altera gateways: troca de token do Mercado Pago retorna 403', async () => {
      const { controller } = setup();
      await expect(
        controller.update(
          {
            paymentGateways: {
              mercadopago: {
                ...savedSettings.paymentGateways.mercadopago,
                accessToken: 'APP_USR-token-do-funcionario-malicioso',
              },
            },
          } as unknown as UpdateSettingsDto,
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('funcionário não altera gateways: habilitar gateway retorna 403', async () => {
      const { controller } = setup();
      await expect(
        controller.update(
          {
            paymentGateways: {
              mercadopago: {
                ...savedSettings.paymentGateways.mercadopago,
                enabled: true,
              },
            },
          } as unknown as UpdateSettingsDto,
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('funcionário não altera gateways: troca de apiKey da InfinitePay retorna 403', async () => {
      const { controller } = setup();
      await expect(
        controller.update(
          {
            paymentGateways: {
              infinitepay: {
                ...savedSettings.paymentGateways.infinitepay,
                apiKey: 'inchk_outra_chave_maliciosa',
              },
            },
          } as unknown as UpdateSettingsDto,
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('funcionário não altera gateways: cadastrar gateway desconhecido retorna 403', async () => {
      const { controller } = setup();
      await expect(
        controller.update(
          {
            paymentGateways: {
              asaas: {
                apiKey: 'asaas_key_1234567890123456',
                enabled: true,
              },
            },
          } as unknown as UpdateSettingsDto,
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('funcionário com links altera marketingLinks normalmente (sem 403)', async () => {
      const { controller, updateUseCase } = setup();
      const links = [{ id: '1', title: 'WhatsApp', url: 'https://wa.me/123' }];
      const res = await controller.update(
        { marketingLinks: links } as unknown as UpdateSettingsDto,
        staffUser,
      );

      expect(res).toBeDefined();
      expect(updateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ marketingLinks: links }),
      );
    });

    it('funcionário não altera gateways: payload parcial vazio { mercadopago: {} } retorna 403', async () => {
      const { controller } = setup();
      await expect(
        controller.update(
          {
            paymentGateways: {
              mercadopago: {},
            },
          } as unknown as UpdateSettingsDto,
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('funcionário não altera gateways: limpar publicKey com { mercadopago: { publicKey: "" } } retorna 403', async () => {
      const { controller } = setup();
      await expect(
        controller.update(
          {
            paymentGateways: {
              mercadopago: {
                publicKey: '',
              },
            },
          } as unknown as UpdateSettingsDto,
          staffUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('funcionário pode alterar pixOnTerminal sem disparar 403', async () => {
      const { controller, updateUseCase } = setup();
      const res = await controller.update(
        {
          paymentGateways: {
            pixOnTerminal: true,
          },
        } as unknown as UpdateSettingsDto,
        staffUser,
      );

      expect(res).toBeDefined();
      expect(updateUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentGateways: expect.objectContaining({ pixOnTerminal: true }),
        }),
      );
    });

    it('admin altera gateways com sucesso', async () => {
      const { controller, updateUseCase } = setup();
      const res = await controller.update(
        {
          paymentGateways: {
            mercadopago: {
              ...savedSettings.paymentGateways.mercadopago,
              enabled: true,
              accessToken: 'APP_USR-novo-token-valido-12345',
            },
          },
        } as unknown as UpdateSettingsDto,
        adminUser,
      );

      expect(res).toBeDefined();
      expect(updateUseCase.execute).toHaveBeenCalled();
    });
  });
});
