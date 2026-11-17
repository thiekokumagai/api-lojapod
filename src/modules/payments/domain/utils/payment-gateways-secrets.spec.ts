import {
  maskPaymentGatewaysForAdmin,
  mergePaymentGatewaysOnUpdate,
  readMercadoPagoConfig,
  secretLast4,
} from './mercadopago-config';

const saved = {
  pixOnTerminal: false,
  infinitepay: {
    enabled: true,
    acceptCreditCard: true,
    handle: 'loja-x',
    apiKey: 'inchk_1234567890abcdef',
    assuredInstallments: 3,
  },
  mercadopago: {
    enabled: true,
    acceptPix: true,
    acceptCreditCard: true,
    publicKey: 'TEST-public',
    accessToken: 'APP_USR-1111222233334444-token-9876',
    webhookSecret: 'whsec_abcdefghijkl7777',
    maxInstallments: 6,
    pixExpirationMinutes: 30,
  },
};

type Masked = {
  infinitepay: Record<string, unknown>;
  mercadopago: Record<string, unknown>;
  pixOnTerminal: boolean;
};

describe('secretLast4', () => {
  it('só os 4 últimos, e só de segredo longo (20+ caracteres)', () => {
    expect(secretLast4('1234567890abcdef9876')).toBe('9876');
    expect(secretLast4('abcdefghijkl9876')).toBeNull(); // 16 caracteres < 20
    expect(secretLast4('curto')).toBeNull();
    expect(secretLast4('')).toBeNull();
  });
});

describe('GET de gateways: admin recebe os segredos para ver com o olho; funcionário não recebe', () => {
  const adminMasked = maskPaymentGatewaysForAdmin(
    saved,
    true,
  ) as unknown as Masked;

  it('Mercado Pago: admin recebe accessToken e webhookSecret completos, com aviso e últimos 4', () => {
    expect(adminMasked.mercadopago).toMatchObject({
      accessToken: 'APP_USR-1111222233334444-token-9876',
      webhookSecret: 'whsec_abcdefghijkl7777',
      accessTokenSet: true,
      accessTokenLast4: '9876',
      webhookSecretSet: true,
      webhookSecretLast4: '7777',
      publicKey: 'TEST-public',
    });
  });

  it('InfinitePay: admin recebe apiKey completa, com aviso e últimos 4', () => {
    expect(adminMasked.infinitepay).toMatchObject({
      enabled: true,
      acceptCreditCard: true,
      handle: 'loja-x',
      assuredInstallments: 3,
      apiKey: 'inchk_1234567890abcdef',
      apiKeySet: true,
      apiKeyLast4: 'cdef',
    });
  });

  it('segredo curto mostra o segredo para o admin, mas não mostra os 4 últimos', () => {
    const short = maskPaymentGatewaysForAdmin(
      {
        infinitepay: { apiKey: 'abc1234' },
      },
      true,
    ) as unknown as Masked;
    expect(short.infinitepay).toMatchObject({
      apiKey: 'abc1234',
      apiKeySet: true,
      apiKeyLast4: null,
    });
  });

  it('sem chave salva: apiKeySet falso', () => {
    const empty = maskPaymentGatewaysForAdmin(
      {
        infinitepay: { enabled: false, handle: '' },
      },
      true,
    ) as unknown as Masked;
    expect(empty.infinitepay).toMatchObject({
      apiKeySet: false,
      apiKeyLast4: null,
    });
  });

  it('não altera o objeto original (o servidor continua lendo a chave para cobrar)', () => {
    maskPaymentGatewaysForAdmin(saved, true);
    expect(saved.infinitepay.apiKey).toBe('inchk_1234567890abcdef');
    expect(readMercadoPagoConfig(saved)?.accessToken).toBe(
      'APP_USR-1111222233334444-token-9876',
    );
  });

  it('não-admin: NÃO recebe segredos nem Last4 (só ...Set)', () => {
    const forStaff = maskPaymentGatewaysForAdmin(
      saved,
      false,
    ) as unknown as Masked;
    expect(forStaff.mercadopago).toMatchObject({
      accessTokenSet: true,
      webhookSecretSet: true,
      publicKey: 'TEST-public',
    });
    expect(forStaff.mercadopago).not.toHaveProperty('accessToken');
    expect(forStaff.mercadopago).not.toHaveProperty('webhookSecret');
    expect(forStaff.mercadopago).not.toHaveProperty('accessTokenLast4');
    expect(forStaff.mercadopago).not.toHaveProperty('webhookSecretLast4');

    expect(forStaff.infinitepay).toMatchObject({
      apiKeySet: true,
    });
    expect(forStaff.infinitepay).not.toHaveProperty('apiKey');
    expect(forStaff.infinitepay).not.toHaveProperty('apiKeyLast4');
  });

  it('gateway desconhecido (ex.: asaas): admin vê chave; funcionário não recebe', () => {
    const withAsaas = {
      ...saved,
      asaas: {
        enabled: true,
        apiKey: '$aact_YzA5ZDMzYjEtNmRmMz00OTMzLTlkMWYtN2NmYzM4NDM1MTc3', // > 20 chars
        secretToken: 'secret_abc',
      },
    };
    const forAdmin = maskPaymentGatewaysForAdmin(withAsaas, true) as Record<
      string,
      any
    >;
    expect(forAdmin.asaas).toMatchObject({
      enabled: true,
      apiKey: '$aact_YzA5ZDMzYjEtNmRmMz00OTMzLTlkMWYtN2NmYzM4NDM1MTc3',
      apiKeySet: true,
      apiKeyLast4: 'MTc3',
    });

    const forStaff = maskPaymentGatewaysForAdmin(withAsaas, false) as Record<
      string,
      any
    >;
    expect(forStaff.asaas).not.toHaveProperty('apiKey');
    expect(forStaff.asaas).not.toHaveProperty('apiKeyLast4');
    expect(forStaff.asaas).toMatchObject({
      enabled: true,
      apiKeySet: true,
    });
  });
});

describe('PUT do admin: campo em branco mantém o segredo salvo', () => {
  const fromPanel = () =>
    maskPaymentGatewaysForAdmin(saved) as unknown as Masked;
  const merge = (incoming: unknown) =>
    mergePaymentGatewaysOnUpdate(incoming, saved) as typeof saved;

  it('InfinitePay: apiKey em branco, ausente ou só o que o painel recebeu mantém a chave', () => {
    const blank = merge({
      ...fromPanel(),
      infinitepay: { ...fromPanel().infinitepay, apiKey: '' },
    });
    expect(blank.infinitepay.apiKey).toBe('inchk_1234567890abcdef');

    const absent = merge({ ...fromPanel() }); // o painel devolve o bloco sem apiKey
    expect(absent.infinitepay.apiKey).toBe('inchk_1234567890abcdef');
    expect(absent.infinitepay).not.toHaveProperty('apiKeySet');
    expect(absent.infinitepay).not.toHaveProperty('apiKeyLast4');
    expect(absent.infinitepay.handle).toBe('loja-x');
  });

  it('InfinitePay: chave nova substitui (com trim) e null apaga a opcional', () => {
    const replaced = merge({
      infinitepay: { ...saved.infinitepay, apiKey: '  inchk_nova  ' },
    });
    expect(replaced.infinitepay.apiKey).toBe('inchk_nova');

    const cleared = merge({
      infinitepay: { ...saved.infinitepay, apiKey: null },
    });
    expect(cleared.infinitepay.apiKey).toBe('');
  });

  it('Mercado Pago: token e segredo em branco mantêm; novos substituem', () => {
    const kept = merge({
      ...fromPanel(),
      mercadopago: {
        ...fromPanel().mercadopago,
        accessToken: '',
        webhookSecret: '',
      },
    });
    expect(kept.mercadopago.accessToken).toBe(
      'APP_USR-1111222233334444-token-9876',
    );
    expect(kept.mercadopago.webhookSecret).toBe('whsec_abcdefghijkl7777');
    expect(JSON.stringify(kept)).not.toMatch(
      /Last4|accessTokenSet|webhookSecretSet/,
    );

    const replaced = merge({
      mercadopago: { ...saved.mercadopago, accessToken: ' APP_USR-novo ' },
    });
    expect(replaced.mercadopago.accessToken).toBe('APP_USR-novo');
  });

  it('outra tela que salva paymentGateways sem InfinitePay/Mercado Pago não apaga nenhum dos dois', () => {
    const merged = merge({ pixOnTerminal: true }) as Record<string, unknown>;
    expect(merged.pixOnTerminal).toBe(true);
    expect(merged.infinitepay).toEqual(saved.infinitepay);
    expect(merged.mercadopago).toEqual(saved.mercadopago);
  });

  it('loja sem nada salvo: salvar a InfinitePay sem chave grava vazio (a chave é opcional)', () => {
    const merged = mergePaymentGatewaysOnUpdate(
      { infinitepay: { enabled: true, handle: 'x' } },
      undefined,
    ) as {
      infinitepay: Record<string, unknown>;
    };
    expect(merged.infinitepay).toMatchObject({
      enabled: true,
      handle: 'x',
      apiKey: '',
    });
  });

  it('o fluxo da InfinitePay segue lendo a chave cheia do banco depois de salvar sem mexer nela', () => {
    const merged = merge({
      ...fromPanel(),
      infinitepay: { ...fromPanel().infinitepay, handle: 'loja-y' },
    });
    expect(merged.infinitepay).toMatchObject({
      handle: 'loja-y',
      apiKey: 'inchk_1234567890abcdef',
      assuredInstallments: 3,
    });
  });

  it('merge com null/não-objeto não apaga gateways salvos', () => {
    // Bloco mercadopago null
    const nullMp = merge({ mercadopago: null });
    expect(nullMp.mercadopago).toEqual(saved.mercadopago);

    // Bloco infinitepay null
    const nullIp = merge({ infinitepay: null });
    expect(nullIp.infinitepay).toEqual(saved.infinitepay);

    // Bloco mercadopago string/primitivo
    const stringMp = merge({ mercadopago: 'invalido' });
    expect(stringMp.mercadopago).toEqual(saved.mercadopago);

    // paymentGateways inteiro null
    const nullAll = merge(null);
    expect(nullAll).toEqual(saved);

    // paymentGateways string
    const stringAll = merge('lixo');
    expect(stringAll).toEqual(saved);
  });

  it('whitelist de campos da InfinitePay descarta campos extras não autorizados', () => {
    const withExtra = merge({
      infinitepay: {
        ...saved.infinitepay,
        extraMaliciousField: 'exploit',
        injectScript: '<script>',
      },
    }) as any;
    expect(withExtra.infinitepay).not.toHaveProperty('extraMaliciousField');
    expect(withExtra.infinitepay).not.toHaveProperty('injectScript');
    expect(withExtra.infinitepay).toMatchObject({
      enabled: true,
      acceptCreditCard: true,
      handle: 'loja-x',
      apiKey: 'inchk_1234567890abcdef',
    });
  });
});
