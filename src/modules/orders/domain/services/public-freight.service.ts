import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  GoogleRoutesClient,
  GoogleRoutesError,
} from '../../infrastructure/google-routes.client';
import {
  FREIGHT_DISTANCE_MARGIN_KM,
  FREIGHT_TOLERANCE,
  FreightConfig,
  acceptableFreightPrices,
  computeFreight,
  distanceRequired,
  freightBounds,
} from '../utils/freight-rules';
import {
  FreightOriginSettings,
  buildFreightDestination,
  buildFreightOrigin,
} from '../utils/freight-address';

export const FREIGHT_CHANGED_MESSAGE = 'O frete mudou, atualize o carrinho.';

const CACHE_TTL_MS = 30 * 60_000;
const CACHE_MAX_ENTRIES = 500;
/** Distância (km) já medida por par origem|destino. Evita pagar de novo por repetição do mesmo endereço (reenvio, erro e nova tentativa). */
const distanceCache = new Map<string, { km: number; expiresAt: number }>();

/** Só para testes. */
export function resetFreightCache() {
  distanceCache.clear();
}

type StoreFreightSettings = FreightConfig &
  FreightOriginSettings & { storePickupEnabled?: boolean | null };

export interface PublicFreightInput {
  settings: StoreFreightSettings;
  order: {
    deliveryModality?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
  };
  /** Soma dos itens com os preços já conferidos (base do frete grátis por valor mínimo). */
  itemsTotal: number;
  /** Cupom de frete grátis validado pelo servidor. */
  freeShippingByCoupon: boolean;
  /** Frete que o navegador enviou (-1 = "a combinar"). */
  clientFreight: number;
}

export interface PublicFreightResult {
  /** Frete que o servidor grava no pedido. */
  freight: number;
  source: 'pickup' | 'rules' | 'google' | 'bounds';
  distanceKm?: number;
}

/**
 * Frete do pedido da loja pública, calculado/conferido pelo servidor com a mesma regra do navegador
 * (`freight-rules.ts`). O frete enviado pelo cliente só é aceito se bater (até R$ 0,10).
 *
 * Se o Google estiver fora do ar ou sem chave: por padrão aceita só um frete entre o menor e o maior preço
 * que a loja configurou (uma trava, não o cálculo) e registra aviso; com `FREIGHT_ON_GOOGLE_FAILURE=reject`
 * recusa o pedido com mensagem para tentar de novo.
 */
@Injectable()
export class PublicFreightService {
  private readonly logger = new Logger(PublicFreightService.name);
  private lastFailureWarnAt = 0;

  constructor(private readonly google: GoogleRoutesClient) {}

  async resolve(input: PublicFreightInput): Promise<PublicFreightResult> {
    const { settings, order, itemsTotal, freeShippingByCoupon } = input;
    const rawClient = Number(input.clientFreight) || 0;
    // -1 = "a combinar": para a conta vale 0
    const client = Math.round(Math.max(0, rawClient) * 100) / 100;
    const close = (a: number, b: number) =>
      Math.abs(a - b) <= FREIGHT_TOLERANCE;

    // Retirada na loja: frete zero
    if (order.deliveryModality === 'STORE_PICKUP') {
      if (!settings.storePickupEnabled) {
        throw new BadRequestException(
          'A retirada na loja não está disponível.',
        );
      }
      if (!close(client, 0))
        throw new BadRequestException(FREIGHT_CHANGED_MESSAGE);
      return { freight: 0, source: 'pickup' };
    }

    const needsDistance = distanceRequired(
      settings,
      itemsTotal,
      !freeShippingByCoupon,
    );

    let km = 0;
    let source: PublicFreightResult['source'] = 'rules';
    if (needsDistance) {
      const destination = buildFreightDestination(order);
      if (!destination) {
        throw new BadRequestException('Endereço de entrega incompleto.');
      }
      try {
        km = await this.measure(buildFreightOrigin(settings), destination);
        source = 'google';
      } catch (err) {
        if (err instanceof GoogleRoutesError && err.kind === 'no_route') {
          throw new BadRequestException(
            'Não foi possível calcular a entrega para este endereço. Confira o endereço.',
          );
        }
        return this.whenGoogleFails(err, input, client, close);
      }
    }

    // Fora da área só é recusado quando está claramente fora (folga para o navegador e o servidor medirem um pouco diferente)
    const area = computeFreight(
      settings,
      Math.max(0, km - FREIGHT_DISTANCE_MARGIN_KM),
      itemsTotal,
    );
    if (area.outOfArea !== undefined) {
      throw new BadRequestException(area.outOfArea);
    }

    // Sem depender da distância (taxa fixa, grátis, a combinar...): o preço sai direto das configurações
    const fixed = computeFreight(settings, 0, itemsTotal);
    const acceptable: Array<number | null> = freeShippingByCoupon
      ? [0]
      : needsDistance
        ? acceptableFreightPrices(settings, km, itemsTotal)
        : ['price' in fixed ? fixed.price : null];

    return this.accept(
      acceptable,
      rawClient,
      client,
      close,
      source,
      needsDistance ? km : undefined,
    );
  }

  private accept(
    acceptable: Array<number | null>,
    rawClient: number,
    client: number,
    close: (a: number, b: number) => boolean,
    source: PublicFreightResult['source'],
    distanceKm?: number,
  ): PublicFreightResult {
    // "A combinar" (null): o cliente envia -1 (ou 0)
    if (acceptable.includes(null) && close(client, 0)) {
      return { freight: rawClient <= 0 ? rawClient : 0, source, distanceKm };
    }
    const numeric = acceptable.filter((p): p is number => p !== null);
    if (numeric.some((p) => close(client, p))) {
      return { freight: client, source, distanceKm };
    }
    throw new BadRequestException(FREIGHT_CHANGED_MESSAGE);
  }

  /** Google fora do ar, chave ausente/recusada ou cota estourada. */
  private whenGoogleFails(
    err: unknown,
    input: PublicFreightInput,
    client: number,
    close: (a: number, b: number) => boolean,
  ): PublicFreightResult {
    const kind = err instanceof GoogleRoutesError ? err.kind : 'unavailable';
    const now = Date.now();
    if (now - this.lastFailureWarnAt > 60_000) {
      this.lastFailureWarnAt = now;
      this.logger.warn(
        kind === 'not_configured'
          ? 'GOOGLE_MAPS_SERVER_KEY não configurada: o frete do pedido não pôde ser recalculado pelo servidor.'
          : `Google Routes indisponível (${err instanceof GoogleRoutesError ? (err.status ?? kind) : kind}): o frete do pedido não pôde ser recalculado.`,
      );
    }

    if (
      (process.env.FREIGHT_ON_GOOGLE_FAILURE ?? '').trim().toLowerCase() ===
      'reject'
    ) {
      throw new HttpException(
        'Não foi possível calcular o frete agora. Tente novamente em instantes.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // Trava pelos preços configurados: de graça (retirada/cupom já tratados antes) só se a loja der frete zero
    const bounds = input.freeShippingByCoupon
      ? { min: 0, max: 0 }
      : freightBounds(input.settings, input.itemsTotal);
    if (!bounds) {
      // "A combinar" ou sem faixas: só aceita frete zero/combinar
      if (!close(client, 0))
        throw new BadRequestException(FREIGHT_CHANGED_MESSAGE);
      return { freight: client, source: 'bounds' };
    }
    if (
      client < bounds.min - FREIGHT_TOLERANCE ||
      client > bounds.max + FREIGHT_TOLERANCE
    ) {
      throw new BadRequestException(FREIGHT_CHANGED_MESSAGE);
    }
    return { freight: client, source: 'bounds' };
  }

  private async measure(origin: string, destination: string): Promise<number> {
    const key = `${origin}|${destination}`.toLowerCase();
    const now = Date.now();
    const hit = distanceCache.get(key);
    if (hit && hit.expiresAt > now) return hit.km;

    const km = await this.google.distanceKm(origin, destination);

    if (distanceCache.size >= CACHE_MAX_ENTRIES) {
      for (const [k, v] of distanceCache) {
        if (v.expiresAt <= now) distanceCache.delete(k);
      }
      if (distanceCache.size >= CACHE_MAX_ENTRIES) {
        // ainda cheio: descarta a mais antiga (Map guarda a ordem de inserção)
        const oldest = distanceCache.keys().next().value as string | undefined;
        if (oldest !== undefined) distanceCache.delete(oldest);
      }
    }
    distanceCache.set(key, { km, expiresAt: now + CACHE_TTL_MS });
    return km;
  }
}
