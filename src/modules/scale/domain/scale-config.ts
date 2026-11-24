/**
 * Configuração da balança que o Admin manda ao agente (`balance-lojapod`).
 * O servidor só valida e repassa; quem grava é o agente, no computador da balança.
 */

export const SCALE_PROTOCOLS = [
  'auto',
  'toledo',
  'filizola',
  'urano',
  'elgin',
  'generic',
  'simulator',
] as const;
export const SCALE_BAUD_RATES = [2400, 4800, 9600, 19200] as const;
export const SCALE_DATA_BITS = [7, 8] as const;
export const SCALE_PARITIES = ['none', 'even', 'odd'] as const;
export const SCALE_STOP_BITS = [1, 2] as const;

export type ScaleProtocol = (typeof SCALE_PROTOCOLS)[number];

export interface ScaleConfig {
  /** 'auto' ou nome da porta (COM3 no Windows, /dev/ttyUSB0 no Linux). */
  port: string;
  protocol: ScaleProtocol;
  baudRate: (typeof SCALE_BAUD_RATES)[number];
  dataBits: (typeof SCALE_DATA_BITS)[number];
  parity: (typeof SCALE_PARITIES)[number];
  stopBits: (typeof SCALE_STOP_BITS)[number];
}

const PORT_RE = /^(auto|COM\d{1,3}|\/dev\/[A-Za-z0-9._-]{1,40})$/i;

const includes = <T>(list: readonly T[], value: unknown): value is T =>
  list.includes(value as T);

/** Valida a configuração vinda do Admin. Devolve a configuração limpa ou a mensagem de erro. */
export function parseScaleConfig(
  input: unknown,
): { ok: true; config: ScaleConfig } | { ok: false; error: string } {
  if (!input || typeof input !== 'object')
    return { ok: false, error: 'Configuração inválida.' };
  const raw = input as Record<string, unknown>;

  const port = typeof raw.port === 'string' ? raw.port.trim() : '';
  if (!PORT_RE.test(port))
    return {
      ok: false,
      error: 'Porta inválida. Use "auto" ou o nome da porta (ex.: COM3).',
    };

  const protocol = raw.protocol;
  if (!includes(SCALE_PROTOCOLS, protocol))
    return { ok: false, error: 'Marca/protocolo da balança inválido.' };

  const baudRate = Number(raw.baudRate);
  if (!includes(SCALE_BAUD_RATES, baudRate))
    return { ok: false, error: 'Velocidade (baud) inválida.' };

  const dataBits = raw.dataBits === undefined ? 8 : Number(raw.dataBits);
  if (!includes(SCALE_DATA_BITS, dataBits))
    return { ok: false, error: 'Bits de dados inválidos.' };

  const parity = raw.parity === undefined ? 'none' : raw.parity;
  if (!includes(SCALE_PARITIES, parity))
    return { ok: false, error: 'Paridade inválida.' };

  const stopBits = raw.stopBits === undefined ? 1 : Number(raw.stopBits);
  if (!includes(SCALE_STOP_BITS, stopBits))
    return { ok: false, error: 'Bits de parada inválidos.' };

  return {
    ok: true,
    config: {
      port: /^com/i.test(port) ? port.toUpperCase() : port,
      protocol,
      baudRate,
      dataBits,
      parity,
      stopBits,
    },
  };
}

/** Identificador do aparelho escolhido no agente (ex.: "caixa-1"). */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function parseDeviceId(value: unknown): string | null {
  return typeof value === 'string' && DEVICE_ID_RE.test(value) ? value : null;
}

/** Nome visível da balança (ex.: "Balança Caixa 1"); sem controle de caracteres. */
export function parseDeviceName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const clean = replaceControlChars(value, '').trim().slice(0, 60);
  return clean || fallback;
}

export interface ScaleReading {
  weightKg: number;
  stable: boolean;
  /** Texto cru que a balança mandou (para a tela "Configurar balança"); limitado. */
  raw?: string;
}

/** Leitura vinda do agente. Peso negativo é aceito (balança com tara pode marcar abaixo de zero). */
export function parseScaleReading(input: unknown): ScaleReading | null {
  if (!input || typeof input !== 'object') return null;
  const r = input as Record<string, unknown>;
  const weightKg = Number(r.weightKg);
  if (!Number.isFinite(weightKg) || weightKg < -100 || weightKg > 1000)
    return null;
  const reading: ScaleReading = {
    weightKg: Math.round(weightKg * 1000) / 1000,
    stable: r.stable === true,
  };
  if (typeof r.raw === 'string') {
    // Mantém \t, \n e \r (separadores que a balança manda) e troca o resto por ·
    reading.raw = replaceControlChars(r.raw, '·', ['\t', '\n', '\r']).slice(
      0,
      120,
    );
  }
  return reading;
}

/** Troca caracteres de controle (0–31 e 127) por `replacement`, menos os de `keep`. */
function replaceControlChars(
  value: string,
  replacement: string,
  keep: string[] = [],
): string {
  let out = '';
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    const isControl = code < 32 || code === 127;
    out += isControl && !keep.includes(ch) ? replacement : ch;
  }
  return out;
}
