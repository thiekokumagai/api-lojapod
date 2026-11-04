export function normalizeUberPhone(phoneStr?: string | null): string {
  if (!phoneStr) return '+5511999999999';
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return '+' + digits;
  }
  if (digits.length === 10 || digits.length === 11) {
    return '+55' + digits;
  }
  if (phoneStr.startsWith('+')) {
    return phoneStr;
  }
  return '+55' + digits;
}
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface UberAuthToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at: number; // timestamp ms
}

@Injectable()
export class UberDirectService {
  private readonly logger = new Logger(UberDirectService.name);
  private tokenCache = new Map<string, UberAuthToken>();
  private geocodeCache = new Map<string, Coordinates>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém as configurações Uber Direct da loja
   */
  async getStoreUberSettings(storeId: string) {
    const settings = await this.prisma.storeSettings.findFirst({
      where: { storeId },
    });
    if (!settings) return null;

    return {
      enabled: settings.uberDirectEnabled,
      autoDispatch: settings.uberDirectAutoDispatch,
      clientId: settings.uberDirectClientId,
      clientSecret: settings.uberDirectClientSecret,
      customerId: settings.uberDirectCustomerId,
      environment: settings.uberDirectEnvironment || 'sandbox',
      pickupInstructions: settings.uberDirectPickupInstructions,
      pickupPhone: settings.uberDirectPickupPhone,
      batchSize: settings.uberDirectBatchSize || 3,
      maxAngleDelta: settings.uberDirectMaxAngleDelta || 45.0,
      dispatchDelayMinutes: settings.uberDirectDispatchDelayMinutes ?? 0,
      storeAddress: {
        street: settings.street,
        number: settings.number,
        neighborhood: settings.neighborhood,
        city: settings.city,
        state: settings.state,
        cep: settings.cep,
        complement: settings.complement,
        phone: settings.phone,
        storeName: settings.storeName,
      },
    };
  }

  /**
   * Obtém token de autenticação OAuth2 da Uber com cache
   */
  async getUberToken(storeId: string): Promise<string> {
    const config = await this.getStoreUberSettings(storeId);
    if (!config || !config.clientId || !config.clientSecret) {
      throw new Error('Credenciais da Uber Direct (Client ID / Client Secret) não configuradas.');
    }

    const cacheKey = `${storeId}_${config.clientId}`;
    const cached = this.tokenCache.get(cacheKey);
    const now = Date.now();

    // Se estiver em cache e faltar mais de 60 segundos para expirar
    if (cached && cached.expires_at > now + 60000) {
      return cached.access_token;
    }

    const authUrl = 'https://login.uber.com/oauth/v2/token';
    const params = new URLSearchParams();
    params.append('client_id', config.clientId);
    params.append('client_secret', config.clientSecret);
    params.append('grant_type', 'client_credentials');
    params.append('scope', 'eats.deliveries');

    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.error(`[UberDirect] Falha ao autenticar na Uber (${response.status}): ${errorText}`);
      throw new Error(`Falha na autenticação da Uber Direct: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const tokenInfo: UberAuthToken = {
      ...data,
      expires_at: now + (data.expires_in || 3600) * 1000,
    };
    this.tokenCache.set(cacheKey, tokenInfo);
    return tokenInfo.access_token;
  }

  /**
   * Geocodificação de endereço (OpenStreetMap Nominatim com fallback)
   */
  async geocodeAddress(addressStr: string): Promise<Coordinates | null> {
    const normalized = addressStr.trim().toLowerCase();
    if (this.geocodeCache.has(normalized)) {
      return this.geocodeCache.get(normalized)!;
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressStr)}&countrycodes=br&limit=1`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'LojaPodDeliveryRouting/1.0',
        },
      });

      if (res.ok) {
        const results = await res.json();
        if (results && results.length > 0) {
          const coords: Coordinates = {
            lat: parseFloat(results[0].lat),
            lng: parseFloat(results[0].lon),
          };
          this.geocodeCache.set(normalized, coords);
          return coords;
        }
      }
    } catch (err: any) {
      this.logger.warn(`[UberDirect] Falha ao geocodificar "${addressStr}": ${err.message}`);
    }

    return null;
  }

  /**
   * Calcula distância euclidiana aproximada / Haversine (km)
   */
  calculateDistance(from: Coordinates, to: Coordinates): number {
    const R = 6371; // km
    const dLat = ((to.lat - from.lat) * Math.PI) / 180;
    const dLng = ((to.lng - from.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((from.lat * Math.PI) / 180) *
        Math.cos((to.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Calcula o azimute/ângulo (em graus de 0 a 360) da Origem para o Destino
   */
  calculateBearing(from: Coordinates, to: Coordinates): number {
    const y = Math.sin(((to.lng - from.lng) * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180);
    const x =
      Math.cos((from.lat * Math.PI) / 180) * Math.sin((to.lat * Math.PI) / 180) -
      Math.sin((from.lat * Math.PI) / 180) *
        Math.cos((to.lat * Math.PI) / 180) *
        Math.cos(((to.lng - from.lng) * Math.PI) / 180);
    const bearing = (Math.atan2(y, x) * 180) / Math.PI;
    return (bearing + 360) % 360;
  }

  /**
   * Diferença angular mínima entre dois ângulos (0 a 180 graus)
   */
  angularDifference(angle1: number, angle2: number): number {
    const diff = Math.abs(angle1 - angle2) % 360;
    return diff > 180 ? 360 - diff : diff;
  }

  /**
   * Agrupa pedidos na mesma linha reta / rumo para frente da loja
   */
  async groupOrdersIntoStraightRoutes(
    storeCoords: Coordinates,
    orders: any[],
    maxBatchSize = 3,
    maxAngleDelta = 45.0,
  ): Promise<any[][]> {
    if (!orders || orders.length === 0) return [];

    // 1. Geocodificar pedidos
    const geocodedOrders: Array<{
      order: any;
      coords: Coordinates;
      distance: number;
      bearing: number;
    }> = [];

    for (const ord of orders) {
      const addressQuery = `${ord.street}, ${ord.number}, ${ord.neighborhood}, ${ord.city} - ${ord.state}, ${ord.cep}`;
      const coords = await this.geocodeAddress(addressQuery);
      if (coords) {
        const dist = this.calculateDistance(storeCoords, coords);
        const bear = this.calculateBearing(storeCoords, coords);
        geocodedOrders.push({
          order: ord,
          coords,
          distance: dist,
          bearing: bear,
        });
      } else {
        // Sem coordenadas geográficas, coloca individualmente
        geocodedOrders.push({
          order: ord,
          coords: storeCoords,
          distance: 9999,
          bearing: 0,
        });
      }
    }

    const routes: any[][] = [];
    const remaining = [...geocodedOrders];

    while (remaining.length > 0) {
      // Pega o primeiro como pivô da nova rota
      const pivot = remaining.shift()!;
      const currentRoute = [pivot];

      // Se não temos coordenadas reais do pivô, vira rota individual
      if (pivot.distance === 9999) {
        routes.push(currentRoute.map((item) => item.order));
        continue;
      }

      // Procurar pedidos no mesmo rumo (mesmo cone de direção) e ordenados para frente
      let i = 0;
      while (i < remaining.length && currentRoute.length < maxBatchSize) {
        const candidate = remaining[i];
        if (candidate.distance === 9999) {
          i++;
          continue;
        }

        const angleDiff = this.angularDifference(pivot.bearing, candidate.bearing);
        // Está no mesmo rumo se a variação de ângulo for menor que maxAngleDelta (ex: 45°)
        if (angleDiff <= maxAngleDelta) {
          currentRoute.push(candidate);
          remaining.splice(i, 1);
        } else {
          i++;
        }
      }

      // Ordenar paradas da mais próxima da loja para a mais distante (linha contínua para frente)
      currentRoute.sort((a, b) => a.distance - b.distance);
      routes.push(currentRoute.map((item) => item.order));
    }

    return routes;
  }

  /**
   * Dispara a entrega de um pedido individual ou de múltiplos pedidos na mesma rota
   */
  async dispatchUberDelivery(storeId: string, orders: any[]): Promise<any> {
    if (!orders || orders.length === 0) {
      throw new Error('Nenhum pedido fornecido para despacho');
    }

    const config = await this.getStoreUberSettings(storeId);
    if (!config || !config.enabled) {
      throw new Error('Integração com Uber Direct está desativada para esta loja.');
    }
    if (!config.customerId) {
      throw new Error('Uber Customer ID não configurado.');
    }

    const token = await this.getUberToken(storeId);
    const storeAddr = config.storeAddress;

    const pickupAddress = {
      street_address: [`${storeAddr.street || ''}, ${storeAddr.number || ''}`.trim()],
      city: storeAddr.city || '',
      state: storeAddr.state || '',
      zip_code: storeAddr.cep ? storeAddr.cep.replace(/\D/g, '') : '',
      country: 'BR',
    };

    // Montar os itens manifest e dropoff
    const batchId = orders.length > 1 ? `BATCH-${Date.now()}` : undefined;

    // Se for 1 pedido:
    if (orders.length === 1) {
      const order = orders[0];
      const dropoffAddress = {
        street_address: [`${order.street || ''}, ${order.number || ''}`.trim()],
        city: order.city || '',
        state: order.state || '',
        zip_code: order.cep ? order.cep.replace(/\D/g, '') : '',
        country: 'BR',
      };

      const manifestItems = (order.items || []).map((it: any) => ({
        name: it.productName || 'Produto',
        quantity: it.quantity || 1,
      }));

      if (manifestItems.length === 0) {
        manifestItems.push({ name: `Pedido #${order.orderNumber || order.id}`, quantity: 1 });
      }

      const body: any = {
        pickup: {
          name: storeAddr.storeName || 'Loja',
          address: JSON.stringify(pickupAddress),
          phone_number: normalizeUberPhone(config.pickupPhone || storeAddr.phone),
          instructions: config.pickupInstructions || 'Retirar no balcão de expedição.',
        },
        dropoff: {
          name: order.customerName || 'Cliente',
          address: JSON.stringify(dropoffAddress),
          phone_number: normalizeUberPhone(order.customerPhone),
          instructions: order.observation || order.complement || undefined,
        },
        manifest_items: manifestItems,
        manifest_reference: `PEDIDO-${order.orderNumber || order.id}`,
      };

      const endpoint = `https://api.uber.com/v1/customers/${config.customerId}/deliveries`;
      this.logger.log(`[UberDirect] Enviando corrida para pedido #${order.orderNumber} em ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(`[UberDirect] Erro na criação da entrega (${response.status}): ${errorData}`);
        throw new Error(`Erro ao acionar Uber Direct (${response.status}): ${errorData}`);
      }

      const entrega = await response.json();

      // Atualiza o pedido no banco
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          uberDeliveryId: entrega.id,
          uberTrackingUrl: entrega.tracking_url || entrega.trackingUrl,
          uberDeliveryStatus: entrega.status || 'processing',
          uberDeliveryFee: entrega.fee ? Number(entrega.fee) / 100 : null,
          uberBatchId: null,
        },
      });

      return entrega;
    }

    // Se forem múltiplos pedidos na mesma corrida (Múltiplos dropoffs em sequência na mesma linha reta)
    const dropoffs = orders.map((order, idx) => {
      const dropoffAddress = {
        street_address: [`${order.street || ''}, ${order.number || ''}`.trim()],
        city: order.city || '',
        state: order.state || '',
        zip_code: order.cep ? order.cep.replace(/\D/g, '') : '',
        country: 'BR',
      };

      const manifestItems = (order.items || []).map((it: any) => ({
        name: it.productName || 'Produto',
        quantity: it.quantity || 1,
      }));

      if (manifestItems.length === 0) {
        manifestItems.push({ name: `Pedido #${order.orderNumber || order.id}`, quantity: 1 });
      }

      return {
        name: order.customerName || `Cliente ${idx + 1}`,
        address: JSON.stringify(dropoffAddress),
        phone_number: normalizeUberPhone(order.customerPhone),
        instructions: order.observation || order.complement || undefined,
        manifest_items: manifestItems,
        manifest_reference: `PEDIDO-${order.orderNumber || order.id}`,
      };
    });

    const body: any = {
      pickup: {
        name: storeAddr.storeName || 'Loja',
        address: JSON.stringify(pickupAddress),
        phone_number: normalizeUberPhone(config.pickupPhone || storeAddr.phone),
        instructions: config.pickupInstructions || 'Retirar todos os pacotes identificados no balcão.',
      },
      dropoffs,
      manifest_reference: `ROTA-${orders.map((o) => o.orderNumber).join('-')}`,
    };

    const endpoint = `https://api.uber.com/v1/customers/${config.customerId}/deliveries`;
    this.logger.log(`[UberDirect] Enviando rota em lote com ${orders.length} pedidos em ${endpoint}`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorData = await response.text();
      this.logger.error(`[UberDirect] Erro na rota em lote (${response.status}): ${errorData}`);
      throw new Error(`Erro ao acionar Uber Direct (${response.status}): ${errorData}`);
    }

    const entrega = await response.json();
    const trackingUrl = entrega.tracking_url || entrega.trackingUrl;
    const feePerOrder = entrega.fee ? (Number(entrega.fee) / 100) / orders.length : null;

    for (const order of orders) {
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          uberDeliveryId: entrega.id,
          uberTrackingUrl: trackingUrl,
          uberDeliveryStatus: entrega.status || 'processing',
          uberDeliveryFee: feePerOrder,
          uberBatchId: batchId,
        },
      });
    }

    return entrega;
  }
}

