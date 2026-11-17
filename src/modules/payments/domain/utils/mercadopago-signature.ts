import { createHmac, timingSafeEqual } from 'crypto';

interface VerifyInput {
  /** Cabeçalho `x-signature`: "ts=1704908010,v1=<hmac>" */
  signature?: string | string[];
  /** Cabeçalho `x-request-id` */
  requestId?: string | string[];
  /** `data.id` da notificação (query string) */
  dataId?: string;
  /** Chave secreta do webhook, gerada no painel do Mercado Pago */
  secret: string;
  /** Só para testes: relógio em ms. */
  now?: number;
}

/** Notificação com assinatura mais velha (ou mais nova) que isto é descartada: repetir uma antiga não vale. */
export const SIGNATURE_TOLERANCE_MS = 5 * 60_000;

/** O `ts` do Mercado Pago é epoch em milissegundos; aceita segundos (10 dígitos) por garantia. */
function timestampToMs(ts: string): number {
  const value = Number(ts);
  if (!Number.isFinite(value) || value <= 0) return NaN;
  return value < 1e12 ? value * 1000 : value;
}

const first = (value?: string | string[]): string =>
  (Array.isArray(value) ? value[0] : value) ?? '';

/** Texto assinado pelo Mercado Pago: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` */
export function buildMercadoPagoManifest(
  dataId: string | undefined,
  requestId: string | undefined,
  ts: string,
): string {
  let manifest = '';
  if (dataId) {
    // Ids alfanuméricos entram em minúsculas; ids numéricos de pagamento não mudam.
    manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  }
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;
  return manifest;
}

export function signMercadoPagoManifest(
  manifest: string,
  secret: string,
): string {
  return createHmac('sha256', secret).update(manifest).digest('hex');
}

/** Confere o `x-signature` do webhook (HMAC SHA-256 com a chave secreta da loja). */
export function verifyMercadoPagoSignature(input: VerifyInput): boolean {
  const header = first(input.signature);
  if (!header || !input.secret) return false;

  const parts: Record<string, string> = {};
  for (const piece of header.split(',')) {
    const index = piece.indexOf('=');
    if (index > 0)
      parts[piece.slice(0, index).trim()] = piece.slice(index + 1).trim();
  }
  const { ts, v1 } = parts;
  if (!ts || !v1) return false;

  const sentAt = timestampToMs(ts);
  if (
    Number.isNaN(sentAt) ||
    Math.abs((input.now ?? Date.now()) - sentAt) > SIGNATURE_TOLERANCE_MS
  ) {
    return false;
  }

  const expected = signMercadoPagoManifest(
    buildMercadoPagoManifest(
      input.dataId,
      first(input.requestId) || undefined,
      ts,
    ),
    input.secret,
  );

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(v1, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
