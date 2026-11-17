import {
  isMercadoPagoReady,
  maskPaymentGatewaysForAdmin,
  mergePaymentGatewaysOnUpdate,
  toPublicMercadoPago,
} from './mercadopago-config';
import {
  buildMercadoPagoManifest,
  signMercadoPagoManifest,
  verifyMercadoPagoSignature,
} from './mercadopago-signature';

const saved = {
  infinitepay: {
    enabled: true,
    acceptCreditCard: true,
    handle: 'loja',
    apiKey: 'ip-key',
  },
  mercadopago: {
    enabled: true,
    acceptPix: true,
    acceptCreditCard: true,
    publicKey: 'TEST-public',
    accessToken: 'TEST-secret-token',
    webhookSecret: 'whsec-secret',
    maxInstallments: 6,
    pixExpirationMinutes: 30,
  },
};

describe('config do Mercado Pago: segredos', () => {
  it('a vitrine pública recebe a public key mas nunca access token nem webhook secret', () => {
    const publicCfg = toPublicMercadoPago(saved);
    expect(publicCfg).toEqual({
      enabled: true,
      acceptCreditCard: true,
      acceptPix: true,
      publicKey: 'TEST-public',
      maxInstallments: 6,
    });
    const json = JSON.stringify(publicCfg);
    expect(json).not.toContain('TEST-secret-token');
    expect(json).not.toContain('whsec-secret');
  });

  it('sem credenciais completas a vitrine vê o Mercado Pago como desligado', () => {
    const publicCfg = toPublicMercadoPago({
      mercadopago: { ...saved.mercadopago, accessToken: '' },
    });
    expect(publicCfg).toMatchObject({
      enabled: false,
      acceptPix: false,
      acceptCreditCard: false,
      publicKey: '',
    });
  });

  it('o painel admin recebe os segredos para visualização com o olho; funcionário não recebe', () => {
    const adminMasked = maskPaymentGatewaysForAdmin(saved, true);
    expect(adminMasked.mercadopago).toMatchObject({
      accessToken: 'TEST-secret-token',
      webhookSecret: 'whsec-secret',
      accessTokenSet: true,
      webhookSecretSet: true,
      publicKey: 'TEST-public',
      maxInstallments: 6,
    });
    expect(adminMasked.infinitepay).toMatchObject({
      enabled: true,
      handle: 'loja',
      acceptCreditCard: true,
      apiKey: 'ip-key',
      apiKeySet: true,
    });

    const staffMasked = maskPaymentGatewaysForAdmin(saved, false);
    expect(staffMasked.mercadopago).not.toHaveProperty('accessToken');
    expect(staffMasked.mercadopago).not.toHaveProperty('webhookSecret');
    expect(staffMasked.infinitepay).not.toHaveProperty('apiKey');
  });

  it('salvar com token/segredo em branco mantém os já salvos', () => {
    const fromPanel = maskPaymentGatewaysForAdmin(saved); // o painel devolve o que recebeu
    const merged = mergePaymentGatewaysOnUpdate(
      {
        ...fromPanel,
        mercadopago: {
          ...fromPanel.mercadopago,
          publicKey: 'TEST-nova',
          accessToken: '',
        },
      },
      saved,
    ) as typeof saved;
    expect(merged.mercadopago.accessToken).toBe('TEST-secret-token');
    expect(merged.mercadopago.webhookSecret).toBe('whsec-secret');
    expect(merged.mercadopago.publicKey).toBe('TEST-nova');
    expect(JSON.stringify(merged)).not.toContain('accessTokenSet');
  });

  it('token novo substitui o antigo', () => {
    const merged = mergePaymentGatewaysOnUpdate(
      { mercadopago: { ...saved.mercadopago, accessToken: '  TEST-outro  ' } },
      saved,
    ) as typeof saved;
    expect(merged.mercadopago.accessToken).toBe('TEST-outro');
  });

  it('parcelas ficam entre 1 e 12 e campos desconhecidos são descartados', () => {
    const over = mergePaymentGatewaysOnUpdate(
      {
        mercadopago: { ...saved.mercadopago, maxInstallments: 99, extra: 'x' },
      },
      saved,
    ) as typeof saved;
    const under = mergePaymentGatewaysOnUpdate(
      { mercadopago: { ...saved.mercadopago, maxInstallments: 0 } },
      saved,
    ) as typeof saved;
    const junk = mergePaymentGatewaysOnUpdate(
      { mercadopago: { ...saved.mercadopago, maxInstallments: 'abc' } },
      saved,
    ) as typeof saved;
    expect(over.mercadopago.maxInstallments).toBe(12);
    expect(under.mercadopago.maxInstallments).toBe(1);
    expect(junk.mercadopago.maxInstallments).toBe(1);
    expect(over.mercadopago).not.toHaveProperty('extra');
  });

  it('outra tela que salva paymentGateways sem o bloco do Mercado Pago não apaga a config', () => {
    const merged = mergePaymentGatewaysOnUpdate(
      { pixOnTerminal: true },
      saved,
    ) as Record<string, unknown>;
    expect(merged.pixOnTerminal).toBe(true);
    expect(merged.mercadopago).toEqual(saved.mercadopago);
  });

  it('isMercadoPagoReady exige ligado, token, public key e o método aceito', () => {
    expect(isMercadoPagoReady(saved, 'pix')).toBe(true);
    expect(isMercadoPagoReady(saved, 'card')).toBe(true);
    expect(
      isMercadoPagoReady(
        { mercadopago: { ...saved.mercadopago, acceptPix: false } },
        'pix',
      ),
    ).toBe(false);
    expect(
      isMercadoPagoReady(
        { mercadopago: { ...saved.mercadopago, publicKey: '' } },
        'card',
      ),
    ).toBe(false);
    expect(isMercadoPagoReady({}, 'pix')).toBe(false);
  });
});

describe('verifyMercadoPagoSignature', () => {
  const ts = String(Date.now());
  const sign = (secret: string, dataId: string, requestId: string) =>
    `ts=${ts},v1=${signMercadoPagoManifest(buildMercadoPagoManifest(dataId, requestId, ts), secret)}`;

  it('aceita assinatura correta', () => {
    expect(
      verifyMercadoPagoSignature({
        signature: sign('s3', '123', 'r1'),
        requestId: 'r1',
        dataId: '123',
        secret: 's3',
      }),
    ).toBe(true);
  });

  it('recusa segredo errado, id adulterado, request-id trocado e cabeçalhos ausentes/malformados', () => {
    const header = sign('s3', '123', 'r1');
    expect(
      verifyMercadoPagoSignature({
        signature: header,
        requestId: 'r1',
        dataId: '123',
        secret: 'outro',
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signature: header,
        requestId: 'r1',
        dataId: '124',
        secret: 's3',
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signature: header,
        requestId: 'r2',
        dataId: '123',
        secret: 's3',
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signature: undefined,
        requestId: 'r1',
        dataId: '123',
        secret: 's3',
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signature: 'lixo',
        requestId: 'r1',
        dataId: '123',
        secret: 's3',
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signature: `ts=${ts},v1=abc`,
        requestId: 'r1',
        dataId: '123',
        secret: 's3',
      }),
    ).toBe(false);
    expect(
      verifyMercadoPagoSignature({
        signature: header,
        requestId: 'r1',
        dataId: '123',
        secret: '',
      }),
    ).toBe(false);
  });
});
