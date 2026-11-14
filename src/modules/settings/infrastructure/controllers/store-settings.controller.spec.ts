import { StoreSettingsController } from './store-settings.controller';
import type { GetSettingsUseCase } from '../../domain/use-cases/get-settings.use-case';

interface PublicSettings {
  pixEnabled: boolean;
  pixKey: string | null;
  pixKeyType: string | null;
  pixHolder: string | null;
  paymentGateways: Record<string, unknown>;
}

describe('StoreSettingsController.getStoreSettings (Pix na maquininha)', () => {
  const baseSettings = {
    pixEnabled: true,
    pixKey: '12345678900',
    pixKeyType: 'CPF_CNPJ',
    pixHolder: 'Fulano de Tal',
    vendizapAuthSecret: 'segredo',
  };

  const load = async (paymentGateways: unknown): Promise<PublicSettings> => {
    const useCase = {
      execute: jest
        .fn()
        .mockResolvedValue({ ...baseSettings, paymentGateways }),
    };
    const controller = new StoreSettingsController(
      useCase as unknown as GetSettingsUseCase,
    );
    return (await controller.getStoreSettings()) as unknown as PublicSettings;
  };

  it('com a flag ligada não devolve chave, tipo nem titular do Pix e expõe a flag', async () => {
    const result = await load({
      pixOnTerminal: true,
      infinitepay: { enabled: true, acceptCreditCard: true, apiKey: 'x' },
    });

    expect(result.pixKey).toBeNull();
    expect(result.pixKeyType).toBeNull();
    expect(result.pixHolder).toBeNull();
    expect(result.pixEnabled).toBe(true);
    expect(result.paymentGateways.pixOnTerminal).toBe(true);
    expect(result.paymentGateways.infinitepay).toEqual({
      enabled: true,
      acceptCreditCard: true,
    });
    expect(JSON.stringify(result)).not.toContain('12345678900');
    expect(JSON.stringify(result)).not.toContain('Fulano de Tal');
  });

  it('com a flag desligada mantém o comportamento atual', async () => {
    const result = await load({ pixOnTerminal: false });

    expect(result.pixKey).toBe('12345678900');
    expect(result.pixKeyType).toBe('CPF_CNPJ');
    expect(result.pixHolder).toBe('Fulano de Tal');
    expect(result.paymentGateways).toEqual({});
  });

  it('sem paymentGateways mantém o comportamento atual', async () => {
    const result = await load(null);

    expect(result.pixKey).toBe('12345678900');
    expect(result.paymentGateways).toEqual({});
  });

  it('só o valor booleano true liga a flag', async () => {
    const result = await load({ pixOnTerminal: 'true' });

    expect(result.pixKey).toBe('12345678900');
  });
});
