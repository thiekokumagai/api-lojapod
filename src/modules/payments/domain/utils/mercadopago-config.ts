/**
 * Configuração do Mercado Pago por loja, guardada em `StoreSettings.paymentGateways.mercadopago` (JSON).
 * Sem migration: nada novo no banco.
 *
 * - `accessToken` e `webhookSecret` são segredos: só o servidor lê. Nunca saem em resposta (admin ou pública).
 * - `publicKey` pode ir ao front (o SDK do Mercado Pago precisa dela para tokenizar o cartão).
 */

export interface MercadoPagoConfig {
  enabled: boolean;
  acceptPix: boolean;
  acceptCreditCard: boolean;
  publicKey: string;
  accessToken: string;
  webhookSecret: string;
  /** 1 a 12. Já é o limite que a API aceita para parcelas. */
  maxInstallments: number;
  pixExpirationMinutes: number;
}

export const MERCADOPAGO_PROVIDER = 'MERCADOPAGO';
export const MP_MAX_INSTALLMENTS = 12;
export const MP_DEFAULT_PIX_EXPIRATION_MINUTES = 30;

type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const str = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Lê a config crua (com segredos) de `paymentGateways`. `null` se a loja nunca configurou. */
export function readMercadoPagoConfig(
  gateways: unknown,
): MercadoPagoConfig | null {
  const raw = isObj(gateways) ? gateways.mercadopago : undefined;
  if (!isObj(raw)) return null;
  return {
    enabled: raw.enabled === true,
    acceptPix: raw.acceptPix === true,
    acceptCreditCard: raw.acceptCreditCard === true,
    publicKey: str(raw.publicKey),
    accessToken: str(raw.accessToken),
    webhookSecret: str(raw.webhookSecret),
    maxInstallments: clampInt(raw.maxInstallments, 1, MP_MAX_INSTALLMENTS, 1),
    pixExpirationMinutes: clampInt(
      raw.pixExpirationMinutes,
      5,
      1440,
      MP_DEFAULT_PIX_EXPIRATION_MINUTES,
    ),
  };
}

/** Mercado Pago ligado, com credenciais e com o método pedido aceito. */
export function isMercadoPagoReady(
  gateways: unknown,
  method: 'pix' | 'card',
): boolean {
  const cfg = readMercadoPagoConfig(gateways);
  if (!cfg || !cfg.enabled || !cfg.accessToken || !cfg.publicKey) return false;
  return method === 'pix' ? cfg.acceptPix : cfg.acceptCreditCard;
}

/** Só o que a vitrine pública pode ver. Sem access token e sem webhook secret. */
export function toPublicMercadoPago(gateways: unknown) {
  const cfg = readMercadoPagoConfig(gateways);
  if (!cfg) return undefined;
  const ready = cfg.enabled && !!cfg.accessToken && !!cfg.publicKey;
  return {
    enabled: ready,
    acceptCreditCard: ready && cfg.acceptCreditCard,
    acceptPix: ready && cfg.acceptPix,
    publicKey: ready ? cfg.publicKey : '',
    maxInstallments: cfg.maxInstallments,
  };
}

/**
 * Versão para o painel admin: os segredos nunca voltam; no lugar vai só um aviso de que estão salvos.
 * As outras chaves de `paymentGateways` passam como estão.
 */
/**
 * Só os 4 últimos caracteres, e só de segredo longo (20+ caracteres).
 * De um segredo curto, 4 caracteres revelariam demais.
 * Serve para a tela mostrar "salvo, termina em XXXX" e a pessoa saber qual chave está valendo.
 */
export function secretLast4(secret: string): string | null {
  return secret.length >= 20 ? secret.slice(-4) : null;
}

export function maskPaymentGatewaysForAdmin<T>(gateways: T, isAdmin = true): T {
  if (!isObj(gateways)) return gateways;
  const masked: Obj = { ...gateways };

  if (isObj(gateways.mercadopago)) {
    const cfg = readMercadoPagoConfig(gateways) as MercadoPagoConfig;
    const mp: Obj = {
      enabled: cfg.enabled,
      acceptPix: cfg.acceptPix,
      acceptCreditCard: cfg.acceptCreditCard,
      publicKey: cfg.publicKey,
      maxInstallments: cfg.maxInstallments,
      pixExpirationMinutes: cfg.pixExpirationMinutes,
      accessTokenSet: !!cfg.accessToken,
      webhookSecretSet: !!cfg.webhookSecret,
    };
    if (isAdmin) {
      mp.accessToken = cfg.accessToken || '';
      mp.webhookSecret = cfg.webhookSecret || '';
      mp.accessTokenLast4 = secretLast4(cfg.accessToken);
      mp.webhookSecretLast4 = secretLast4(cfg.webhookSecret);
    }
    masked.mercadopago = mp;
  }

  if (isObj(gateways.infinitepay)) {
    const { apiKey, ...rest } = gateways.infinitepay;
    const key = str(apiKey);
    const ip: Obj = {
      ...rest,
      apiKeySet: !!key,
    };
    if (isAdmin) {
      ip.apiKey = key;
      ip.apiKeyLast4 = secretLast4(key);
    }
    masked.infinitepay = ip;
  }

  // Gateways desconhecidos (ex.: asaas): mascarar qualquer apiKey, accessToken ou secret para não-admin
  for (const [k, val] of Object.entries(gateways)) {
    if (k === 'mercadopago' || k === 'infinitepay') continue;
    if (isObj(val)) {
      const gwObj: Obj = { ...val };
      for (const [prop, propVal] of Object.entries(val)) {
        const lower = prop.toLowerCase();
        if (
          lower === 'apikey' ||
          lower === 'accesstoken' ||
          lower === 'secret' ||
          lower === 'webhooksecret'
        ) {
          const s = str(propVal);
          gwObj[`${prop}Set`] = !!s;
          if (isAdmin) {
            gwObj[prop] = propVal;
            gwObj[`${prop}Last4`] = secretLast4(s);
          } else {
            delete gwObj[prop];
          }
        }
      }
      masked[k] = gwObj;
    }
  }

  return masked as T;
}

/**
 * Mescla o `paymentGateways` que veio do painel com o salvo:
 * - se o bloco de um gateway (ou paymentGateways) vier null/não-objeto, mantém o salvo;
 * - token/segredo/chave em branco mantém o que já estava salvo (o painel nunca recebe os valores);
 * - a chave opcional da InfinitePay só é apagada com `apiKey: null` (pedido explícito);
 * - o bloco `mercadopago` é normalizado (parcelas 1–12, booleanos, só campos conhecidos);
 * - whitelist estrita de campos da InfinitePay (sem vazamento de campos arbitrários);
 * - se o painel mandou `paymentGateways` sem o bloco de um gateway, o que estava salvo é preservado.
 * Devolve `undefined` quando o painel não mexeu em `paymentGateways`.
 */
export function mergePaymentGatewaysOnUpdate(
  incoming: unknown,
  previous: unknown,
): unknown {
  if (incoming === undefined) return undefined;
  if (!isObj(incoming)) return isObj(previous) ? previous : {};

  const prev: Obj = isObj(previous) ? previous : {};
  const result: Obj = { ...incoming };

  // Mercado Pago
  const prevMp = isObj(prev.mercadopago) ? prev.mercadopago : undefined;
  const incMp = incoming.mercadopago;
  if (incMp === undefined || !isObj(incMp)) {
    if (prevMp) {
      result.mercadopago = prevMp;
    } else {
      delete result.mercadopago;
    }
  } else {
    result.mercadopago = {
      enabled: incMp.enabled === true,
      acceptPix: incMp.acceptPix === true,
      acceptCreditCard: incMp.acceptCreditCard === true,
      publicKey: str(incMp.publicKey),
      accessToken:
        incMp.accessToken === null
          ? ''
          : str(incMp.accessToken) || str(prevMp?.accessToken),
      webhookSecret:
        incMp.webhookSecret === null
          ? ''
          : str(incMp.webhookSecret) || str(prevMp?.webhookSecret),
      maxInstallments: clampInt(
        incMp.maxInstallments,
        1,
        MP_MAX_INSTALLMENTS,
        1,
      ),
      pixExpirationMinutes: clampInt(
        incMp.pixExpirationMinutes,
        5,
        1440,
        MP_DEFAULT_PIX_EXPIRATION_MINUTES,
      ),
    };
  }

  // InfinitePay
  const prevIp = isObj(prev.infinitepay) ? prev.infinitepay : undefined;
  const incIp = incoming.infinitepay;
  if (incIp === undefined || !isObj(incIp)) {
    if (prevIp) {
      result.infinitepay = prevIp;
    } else {
      delete result.infinitepay;
    }
  } else {
    result.infinitepay = {
      enabled: incIp.enabled === true,
      acceptCreditCard: incIp.acceptCreditCard === true,
      handle: str(incIp.handle) || str(prevIp?.handle),
      apiKey:
        incIp.apiKey === null ? '' : str(incIp.apiKey) || str(prevIp?.apiKey),
      ...(incIp.assuredInstallments !== undefined ||
      prevIp?.assuredInstallments !== undefined
        ? {
            assuredInstallments: clampInt(
              incIp.assuredInstallments ?? prevIp?.assuredInstallments,
              1,
              12,
              1,
            ),
          }
        : {}),
    };
  }

  // Se o previous tinha algum gateway que não veio ou veio null no incoming, preservar
  for (const [k, v] of Object.entries(prev)) {
    if (result[k] === undefined || !isObj(result[k])) {
      if (isObj(v)) {
        result[k] = v;
      }
    } else if (k !== 'mercadopago' && k !== 'infinitepay' && isObj(result[k])) {
      // Gateway desconhecido preserva secrets se vazio
      const prevGw = isObj(v) ? v : {};
      const currGw = result[k];
      for (const [prop, val] of Object.entries(currGw)) {
        const lower = prop.toLowerCase();
        if (
          lower === 'apikey' ||
          lower === 'accesstoken' ||
          lower === 'secret' ||
          lower === 'webhooksecret'
        ) {
          if (val === '') {
            currGw[prop] = prevGw[prop] || '';
          }
        }
      }
    }
  }

  return result;
}
