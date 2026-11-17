import {
  buildMercadoPagoManifest,
  signMercadoPagoManifest,
  verifyMercadoPagoSignature,
} from './mercadopago-signature';

describe('G: tolerância do ts da assinatura (replay)', () => {
  const secret = 's3';
  const now = 1_800_000_000_000; // ms
  const header = (ts: string) =>
    `ts=${ts},v1=${signMercadoPagoManifest(buildMercadoPagoManifest('123', 'r1', ts), secret)}`;
  const verify = (ts: string) =>
    verifyMercadoPagoSignature({
      signature: header(ts),
      requestId: 'r1',
      dataId: '123',
      secret,
      now,
    });

  it('ts em milissegundos: aceita até 5 min de diferença, nos dois sentidos', () => {
    expect(verify(String(now))).toBe(true);
    expect(verify(String(now - 4 * 60_000))).toBe(true);
    expect(verify(String(now + 4 * 60_000))).toBe(true);
  });

  it('assinatura antiga (replay) ou do futuro distante é recusada, mesmo com a assinatura correta', () => {
    expect(verify(String(now - 6 * 60_000))).toBe(false);
    expect(verify(String(now - 24 * 60 * 60_000))).toBe(false);
    expect(verify(String(now + 10 * 60_000))).toBe(false);
  });

  it('ts em segundos (10 dígitos) também é entendido', () => {
    expect(verify(String(Math.floor(now / 1000)))).toBe(true);
    expect(verify(String(Math.floor(now / 1000) - 3600))).toBe(false);
  });

  it('ts inválido é recusado', () => {
    expect(verify('abc')).toBe(false);
    expect(verify('0')).toBe(false);
  });

  it('sem informar o relógio, usa a hora atual', () => {
    const ts = String(Date.now());
    expect(
      verifyMercadoPagoSignature({
        signature: header(ts),
        requestId: 'r1',
        dataId: '123',
        secret,
      }),
    ).toBe(true);
    const old = String(Date.now() - 60 * 60_000);
    expect(
      verifyMercadoPagoSignature({
        signature: header(old),
        requestId: 'r1',
        dataId: '123',
        secret,
      }),
    ).toBe(false);
  });
});
