import { SettingsController } from './settings.controller';
import type { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';
import type { UpdateSettingsUseCase } from '../../domain/use-cases/update-settings.use-case';
import type { MinioService } from '../../../../minio/minio.service';

const ip = {
  enabled: true,
  acceptCreditCard: true,
  handle: 'loja-x',
  apiKey: 'inchk_1234567890abcdef',
  assuredInstallments: 1,
};
const mp = {
  enabled: true,
  acceptPix: true,
  acceptCreditCard: true,
  publicKey: 'TEST-public',
  accessToken: 'APP_USR-1111222233334444-token-9876',
  webhookSecret: 'whsec_abcdefghijkl7777',
  maxInstallments: 3,
  pixExpirationMinutes: 30,
};

function admin() {
  const saved = {
    id: 's',
    paymentGateways: { infinitepay: ip, mercadopago: mp },
  };
  const execute = jest
    .fn()
    .mockImplementation((dto: { paymentGateways?: unknown }) =>
      Promise.resolve({ id: 's', paymentGateways: dto.paymentGateways }),
    );
  const controller = new SettingsController(
    {
      execute: jest.fn().mockResolvedValue(saved),
    } as unknown as GetSettingsUseCase,
    { execute } as unknown as UpdateSettingsUseCase,
    {} as MinioService,
  );
  return { controller, execute };
}

describe('SettingsController: chave da InfinitePay e segredos do Mercado Pago', () => {
  it('GET do admin devolve os segredos completos e os Last4 para visualização', async () => {
    const { controller } = admin();
    const result = (await controller.get()) as {
      paymentGateways: {
        infinitepay: Record<string, unknown>;
        mercadopago: Record<string, unknown>;
      };
    };

    expect(result.paymentGateways.infinitepay).toMatchObject({
      apiKey: ip.apiKey,
      apiKeySet: true,
      apiKeyLast4: 'cdef',
      handle: 'loja-x',
    });
    expect(result.paymentGateways.mercadopago).toMatchObject({
      accessToken: mp.accessToken,
      webhookSecret: mp.webhookSecret,
      accessTokenSet: true,
      accessTokenLast4: '9876',
      webhookSecretSet: true,
      webhookSecretLast4: '7777',
    });
  });

  it('GET do funcionário NÃO devolve segredos nem Last4', async () => {
    const { controller } = admin();
    const result = (await controller.get({
      sub: 'staff-1',
      email: 'func@loja.com',
      role: 'USER',
      storeId: 's',
    })) as {
      paymentGateways: {
        infinitepay: Record<string, unknown>;
        mercadopago: Record<string, unknown>;
      };
    };

    expect(result.paymentGateways.infinitepay.apiKey).toBeUndefined();
    expect(result.paymentGateways.infinitepay.apiKeyLast4).toBeUndefined();
    expect(result.paymentGateways.infinitepay.apiKeySet).toBe(true);

    expect(result.paymentGateways.mercadopago.accessToken).toBeUndefined();
    expect(result.paymentGateways.mercadopago.webhookSecret).toBeUndefined();
    expect(result.paymentGateways.mercadopago.accessTokenLast4).toBeUndefined();
    expect(
      result.paymentGateways.mercadopago.webhookSecretLast4,
    ).toBeUndefined();
  });

  it('PUT com campos em branco grava os segredos já salvos e a resposta do admin devolve os salvos', async () => {
    const { controller, execute } = admin();
    const fromPanel = (await controller.get()).paymentGateways as Record<
      string,
      Record<string, unknown>
    >;

    const result = (await controller.update({
      paymentGateways: {
        ...fromPanel,
        infinitepay: {
          ...fromPanel.infinitepay,
          apiKey: '',
          handle: 'loja-nova',
        },
        mercadopago: {
          ...fromPanel.mercadopago,
          accessToken: '',
          webhookSecret: '',
        },
      },
    } as never)) as {
      paymentGateways: {
        infinitepay: Record<string, unknown>;
        mercadopago: Record<string, unknown>;
      };
    };

    const sent = (
      execute.mock.calls[0][0] as {
        paymentGateways: Record<string, Record<string, unknown>>;
      }
    ).paymentGateways;
    // o que vai para o banco (e que a InfinitePay/Mercado Pago usam para cobrar) segue completo
    expect(sent.infinitepay).toMatchObject({
      apiKey: ip.apiKey,
      handle: 'loja-nova',
      assuredInstallments: 1,
    });
    expect(sent.mercadopago).toMatchObject({
      accessToken: mp.accessToken,
      webhookSecret: mp.webhookSecret,
    });
    expect(JSON.stringify(sent)).not.toMatch(
      /apiKeySet|Last4|accessTokenSet|webhookSecretSet/,
    );

    expect(result.paymentGateways.infinitepay.apiKey).toBe(ip.apiKey);
    expect(result.paymentGateways.mercadopago.accessToken).toBe(mp.accessToken);
    expect(result.paymentGateways.mercadopago.webhookSecret).toBe(
      mp.webhookSecret,
    );
  });

  it('chave nova da InfinitePay é gravada; null apaga a chave opcional', async () => {
    const { controller, execute } = admin();
    await controller.update({
      paymentGateways: {
        infinitepay: { ...ip, apiKey: 'inchk_nova_chave_01' },
      },
    } as never);
    expect(
      (
        execute.mock.calls[0][0] as {
          paymentGateways: { infinitepay: { apiKey: string } };
        }
      ).paymentGateways.infinitepay.apiKey,
    ).toBe('inchk_nova_chave_01');

    await controller.update({
      paymentGateways: { infinitepay: { ...ip, apiKey: null } },
    } as never);
    expect(
      (
        execute.mock.calls[1][0] as {
          paymentGateways: { infinitepay: { apiKey: string } };
        }
      ).paymentGateways.infinitepay.apiKey,
    ).toBe('');
  });
});
