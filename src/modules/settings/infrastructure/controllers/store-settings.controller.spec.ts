import { StoreSettingsController, toIcon512Path } from './store-settings.controller';
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
      {} as any,
      {} as any,
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

  it('devolve businessType da loja (padrão POD ou valor salvo)', async () => {
    const useCase = {
      execute: jest.fn().mockResolvedValue({
        ...baseSettings,
        businessType: 'ACAI',
        paymentGateways: null,
      }),
    };
    const controller = new StoreSettingsController(
      useCase as unknown as GetSettingsUseCase,
      {} as any,
      {} as any,
    );
    const result = (await controller.getStoreSettings()) as any;
    expect(result.businessType).toBe('ACAI');
  });
});

describe('StoreSettingsController.getManifest (app instalável do admin)', () => {
  const STORE_ID = 'store-abc-123';
  const storeSettings = { storeName: 'Niko Onigiri', faviconUrl: `${STORE_ID}/settings/pwa-icon-192-1700000000000.png` };

  const setup = (opts: { storeExists?: boolean; hostSettings?: any } = {}) => {
    const runs: any[] = [];
    let current: any = null;
    const useCase = {
      execute: jest.fn().mockImplementation(async () => {
        if (current?.storeId === STORE_ID) return storeSettings;
        if (opts.hostSettings) return opts.hostSettings;
        throw new Error('sem loja no host');
      }),
    };
    const prisma = {
      store: {
        findUnique: jest.fn().mockResolvedValue(
          opts.storeExists === false ? null : { id: STORE_ID, subdomain: 'niko', isActive: true },
        ),
      },
    };
    const tenant = {
      run: jest.fn().mockImplementation((ctx: any, cb: () => any) => {
        runs.push(ctx);
        current = ctx;
        const out = cb();
        return Promise.resolve(out).finally(() => (current = null));
      }),
    };
    const controller = new StoreSettingsController(useCase as any, prisma as any, tenant as any);
    const res = { setHeader: jest.fn() };
    const call = (origin?: string, storeId?: string) =>
      controller.getManifest({ headers: origin ? { origin } : {} } as any, res as any, storeId);
    return { call, res, runs, prisma };
  };

  const OLD_ENV = { ...process.env };
  beforeEach(() => {
    process.env.MINIO_PUBLIC_URL = 'https://cdn.exemplo.com';
    process.env.MINIO_BUCKET = 'lojapod';
    process.env.ADMIN_FRONTEND_URL = 'https://admin.lojapod.com';
  });
  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('com storeId usa nome e ícones da loja (192 e 512)', async () => {
    const { call, runs } = setup();
    const m: any = await call('https://admin.lojapod.com', STORE_ID);
    expect(runs[0]).toEqual({ storeId: STORE_ID, subdomain: 'niko', isActive: true });
    expect(m.name).toBe('Niko Onigiri');
    expect(m.icons).toEqual([
      { src: `https://cdn.exemplo.com/lojapod/${STORE_ID}/settings/pwa-icon-192-1700000000000.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `https://cdn.exemplo.com/lojapod/${STORE_ID}/settings/pwa-icon-512-1700000000000.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    ]);
  });

  it.each(['https://admin.lojapod.com', 'https://admin.podipedir.com.br'])(
    'start_url e scope seguem o domínio que pediu (%s)',
    async (origin) => {
      const { call, res } = setup();
      const m: any = await call(origin, STORE_ID);
      expect(m.start_url).toBe(`${origin}/`);
      expect(m.scope).toBe(`${origin}/`);
      expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Origin');
    },
  );

  it('sem Origin usa ADMIN_FRONTEND_URL', async () => {
    const { call } = setup();
    const m: any = await call(undefined, STORE_ID);
    expect(m.start_url).toBe('https://admin.lojapod.com/');
  });

  it.each([
    ['loja inexistente', { storeExists: false }, STORE_ID],
    ['sem storeId (host sem loja)', {}, undefined],
  ])('%s cai no Podi Pedir com os ícones padrão do admin', async (_label, opts, storeId) => {
    const { call } = setup(opts as any);
    const m: any = await call('https://admin.podipedir.com.br', storeId as any);
    expect(m.name).toBe('Podi Pedir');
    expect(m.icons[0].src).toBe('https://admin.podipedir.com.br/favicon-192x192.png');
    expect(m.icons[1].src).toBe('https://admin.podipedir.com.br/favicon-512x512.png');
  });

  it('toIcon512Path troca só o nome do arquivo, não um "192" no id da pasta', () => {
    expect(toIcon512Path('a192b/settings/pwa-icon-192-1700.png')).toBe('a192b/settings/pwa-icon-512-1700.png');
    expect(toIcon512Path('loja/logo.png')).toBe('loja/logo.png');
  });

  it('storeId com formato inválido não consulta o banco', async () => {
    const { call, prisma } = setup();
    await call('https://admin.lojapod.com', "x'; drop");
    expect(prisma.store.findUnique).not.toHaveBeenCalled();
  });
});
