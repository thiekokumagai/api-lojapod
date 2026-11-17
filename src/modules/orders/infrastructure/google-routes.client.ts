import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';

export type GoogleRoutesErrorKind =
  /** Sem `GOOGLE_MAPS_SERVER_KEY` no servidor. */
  | 'not_configured'
  /** O Google não achou rota para o endereço (endereço inválido ou fora de alcance). */
  | 'no_route'
  /** Google fora do ar, chave recusada, cota estourada, rede ou resposta inválida. */
  | 'unavailable';

/** Erro do Google. Nunca carrega a chave nem a requisição (o axios guarda os cabeçalhos no erro). */
export class GoogleRoutesError extends Error {
  constructor(
    readonly kind: GoogleRoutesErrorKind,
    readonly status?: number,
  ) {
    super(`Google Routes: ${kind}${status ? ` (HTTP ${status})` : ''}`);
    this.name = 'GoogleRoutesError';
  }
}

interface RoutesResponse {
  routes?: Array<{ distanceMeters?: number }>;
}

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Distância de carro entre dois endereços (Routes API do Google). É a mesma chamada que o navegador faz hoje
 * (`use-calculator-freight.tsx`), agora também no servidor, para o frete do pedido público não depender do cliente.
 * A chave vem só de `GOOGLE_MAPS_SERVER_KEY` (nunca de código nem de log). Os testes trocam esta classe por um mock.
 */
@Injectable()
export class GoogleRoutesClient {
  isConfigured(): boolean {
    return !!(process.env.GOOGLE_MAPS_SERVER_KEY ?? '').trim();
  }

  async distanceKm(origin: string, destination: string): Promise<number> {
    const key = (process.env.GOOGLE_MAPS_SERVER_KEY ?? '').trim();
    if (!key) throw new GoogleRoutesError('not_configured');

    let response: AxiosResponse<RoutesResponse>;
    try {
      response = await axios.post<RoutesResponse>(
        ROUTES_URL,
        {
          origin: { address: origin },
          destination: { address: destination },
          travelMode: 'DRIVE',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            // Só a distância: pede menos campos e custa menos
            'X-Goog-FieldMask': 'routes.distanceMeters',
          },
          timeout: 8000,
          validateStatus: () => true,
        },
      );
    } catch {
      // Sem repassar o erro original: ele traz a requisição, e nela a chave
      throw new GoogleRoutesError('unavailable');
    }

    if (response.status === 400 || response.status === 404) {
      throw new GoogleRoutesError('no_route', response.status);
    }
    if (response.status < 200 || response.status >= 300) {
      throw new GoogleRoutesError('unavailable', response.status);
    }

    const meters = response.data?.routes?.[0]?.distanceMeters;
    if (response.data?.routes && response.data.routes.length === 0) {
      throw new GoogleRoutesError('no_route', response.status);
    }
    if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) {
      throw new GoogleRoutesError('unavailable', response.status);
    }
    return meters / 1000;
  }
}
