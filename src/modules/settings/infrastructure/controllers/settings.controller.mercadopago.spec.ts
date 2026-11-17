import { SettingsController } from './settings.controller';
import { StoreSettingsController } from './store-settings.controller';
import type { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';
import type { UpdateSettingsUseCase } from '../../domain/use-cases/update-settings.use-case';
import type { MinioService } from '../../../../minio/minio.service';
import { getPaymentNotAllowedReason } from '../../../orders/domain/utils/payment-availability';
import type { StoreSettings } from '../../domain/entities/store-settings.entity';

const mp = {
  enabled: true,
  acceptPix: true,
  acceptCreditCard: true,
  publicKey: 'TEST-public',
  accessToken: 'TEST-secret-token',
  webhookSecret: 'whsec-secret',
  maxInstallments: 6,
  pixExpirationMinutes: 30,
};

function admin(saved: unknown) {
  const get = jest.fn().mockResolvedValue({ id: 's', paymentGateways: saved });
  const execute = jest
    .fn()
    .mockImplementation(async (dto: { paymentGateways?: unknown }) => ({
      id: 's',
      paymentGateways: dto.paymentGateways,
    }));
  const controller = new SettingsController(
    { execute: get } as unknown as GetSettingsUseCase,
    { execute } as unknown as UpdateSettingsUseCase,
    {} as MinioService,
  );
  return { controller, execute };
}

describe('SettingsController e os segredos do Mercado Pago', () => {
  it('GET admin devolve access token e webhook secret para o admin visualizar', async () => {
    const { controller } = admin({ mercadopago: mp });
    const result = await controller.get();
    expect(result.paymentGateways).toMatchObject({
      mercadopago: {
        accessToken: 'TEST-secret-token',
        webhookSecret: 'whsec-secret',
        accessTokenSet: true,
        webhookSecretSet: true,
        publicKey: 'TEST-public',
      },
    });
  });

  it('GET funcionário NÃO devolve access token nem webhook secret', async () => {
    const { controller } = admin({ mercadopago: mp });
    const result = await controller.get({
      sub: 'u1',
      email: 'staff@loja.com',
      role: 'USER',
      storeId: 's',
    });
    const mpRes = (result.paymentGateways as Record<string, any>).mercadopago;
    expect(mpRes.accessToken).toBeUndefined();
    expect(mpRes.webhookSecret).toBeUndefined();
    expect(mpRes.accessTokenLast4).toBeUndefined();
    expect(mpRes.accessTokenSet).toBe(true);
  });

  it('PUT com token em branco grava o token já salvo e o admin recebe o valor salvo de volta', async () => {
    const { controller, execute } = admin({ mercadopago: mp });
    const result = await controller.update({
      paymentGateways: {
        mercadopago: {
          ...mp,
          accessToken: '',
          webhookSecret: '',
          maxInstallments: 99,
        },
      },
    } as never);

    const saved = (
      execute.mock.calls[0][0] as {
        paymentGateways: { mercadopago: typeof mp };
      }
    ).paymentGateways.mercadopago;
    expect(saved.accessToken).toBe('TEST-secret-token');
    expect(saved.webhookSecret).toBe('whsec-secret');
    expect(saved.maxInstallments).toBe(12);
    expect(
      (result.paymentGateways as Record<string, any>).mercadopago.accessToken,
    ).toBe('TEST-secret-token');
  });

  it('PUT com token null limpa o segredo salvo (remoção explícita)', async () => {
    const { controller, execute } = admin({ mercadopago: mp });
    await controller.update({
      paymentGateways: {
        mercadopago: {
          ...mp,
          accessToken: null,
          webhookSecret: null,
        },
      },
    } as never);

    const saved = (
      execute.mock.calls[0][0] as {
        paymentGateways: { mercadopago: typeof mp };
      }
    ).paymentGateways.mercadopago;
    expect(saved.accessToken).toBe('');
    expect(saved.webhookSecret).toBe('');
  });
});

describe('vitrine pública e disponibilidade', () => {
  it('a vitrine expõe a public key e as formas aceitas, sem segredos', async () => {
    const useCase = {
      execute: jest.fn().mockResolvedValue({
        pixEnabled: false,
        paymentGateways: { mercadopago: mp },
      }),
    };
    const controller = new StoreSettingsController(
      useCase as unknown as GetSettingsUseCase,
    );
    const result = (await controller.getStoreSettings()) as unknown as {
      paymentGateways: Record<string, unknown>;
    };
    expect(result.paymentGateways.mercadopago).toEqual({
      enabled: true,
      acceptCreditCard: true,
      acceptPix: true,
      publicKey: 'TEST-public',
      maxInstallments: 6,
    });
    expect(JSON.stringify(result)).not.toContain('TEST-secret-token');
    expect(JSON.stringify(result)).not.toContain('whsec-secret');
  });

  const settings = (gateways: unknown, pixEnabled = false) =>
    ({ pixEnabled, paymentGateways: gateways }) as unknown as StoreSettings;

  it('Pix online é aceito com Mercado Pago pronto mesmo sem chave Pix da loja', () => {
    expect(
      getPaymentNotAllowedReason(
        settings({ mercadopago: mp }),
        'online',
        'pix',
      ),
    ).toBeNull();
  });

  it('Pix online continua recusado sem Pix da loja e sem Mercado Pago; entrega não usa o Mercado Pago', () => {
    expect(
      getPaymentNotAllowedReason(settings({}), 'online', 'pix'),
    ).not.toBeNull();
    expect(
      getPaymentNotAllowedReason(
        settings({ mercadopago: { ...mp, accessToken: '' } }),
        'online',
        'pix',
      ),
    ).not.toBeNull();
    expect(
      getPaymentNotAllowedReason(
        settings({ mercadopago: mp }),
        'entrega',
        'pix',
      ),
    ).not.toBeNull();
  });

  it('cartão online com Mercado Pago só vale com credenciais completas', () => {
    expect(
      getPaymentNotAllowedReason(
        settings({ mercadopago: mp }),
        'online',
        'credit',
      ),
    ).toBeNull();
    expect(
      getPaymentNotAllowedReason(
        settings({ mercadopago: { ...mp, publicKey: '' } }),
        'online',
        'credit',
      ),
    ).not.toBeNull();
  });
});
