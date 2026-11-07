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
import { EventsGateway } from '../events/events.gateway';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventsGateway: EventsGateway,
  ) {}

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
   * Consulta a Uber pelo status atual da corrida de um pedido e salva no pedido.
   * Não altera o status do pedido, só os dados da corrida (status, link, taxa).
   */
  async refreshDeliveryStatus(storeId: string, orderId: string) {
    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId } });
    if (!order || !order.uberDeliveryId) {
      throw new Error('Pedido sem corrida da Uber Direct.');
    }

    const config = await this.getStoreUberSettings(storeId);
    if (!config?.customerId) {
      throw new Error('Uber Customer ID não configurado.');
    }

    const token = await this.getUberToken(storeId);
    const endpoint = `https://api.uber.com/v1/customers/${config.customerId}/deliveries/${order.uberDeliveryId}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      this.logger.warn(`[UberDirect] Falha ao consultar corrida ${order.uberDeliveryId} (${response.status}): ${errorText}`);
      throw new Error(`Erro ao consultar a Uber (${response.status})`);
    }

    const data = await response.json();
    const status = data.status || order.uberDeliveryStatus;
    const trackingUrl = data.tracking_url || data.trackingUrl || order.uberTrackingUrl;
    const fee = data.fee != null ? Number(data.fee) / 100 : order.uberDeliveryFee;

    await this.prisma.order.update({
      where: { id: order.id },
      data: { uberDeliveryStatus: status, uberTrackingUrl: trackingUrl, uberDeliveryFee: fee },
    });

    return { status, trackingUrl, fee };
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
   * Tenta geocodificar um endereço com formatos de busca cada vez mais simples
   * (o Nominatim costuma falhar com bairro/complemento ou numeração exata).
   */
  async geocodeWithFallbacks(parts: {
    street?: string | null;
    number?: string | null;
    neighborhood?: string | null;
    city?: string | null;
    state?: string | null;
    cep?: string | null;
  }): Promise<Coordinates | null> {
    const clean = (v?: string | null) => (v || '').trim();
    const street = clean(parts.street);
    const number = clean(parts.number);
    const neighborhood = clean(parts.neighborhood);
    const city = clean(parts.city);
    const state = clean(parts.state);
    const cep = clean(parts.cep);
    const join = (...xs: string[]) => xs.filter(Boolean).join(', ');

    const variants = [
      join(`${street} ${number}`.trim(), neighborhood, city, state),
      join(`${street} ${number}`.trim(), city, state),
      join(street, neighborhood, city, state),
      join(street, city, state),
      join(cep, city, state),
      join(neighborhood, city, state),
    ].filter((v, i, arr) => v && arr.indexOf(v) === i);

    for (const query of variants) {
      const coords = await this.geocodeAddress(query);
      if (coords) return coords;
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
      const coords = await this.geocodeWithFallbacks({
        street: ord.street,
        number: ord.number,
        neighborhood: ord.neighborhood,
        city: ord.city,
        state: ord.state,
        cep: ord.cep,
      });
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

    const batchId = orders.length > 1 ? `BATCH-${Date.now()}` : null;
    const results: any[] = [];

    for (const order of orders) {
      try {
        const dropoffAddress = {
          street_address: [`${order.street || ''}, ${order.number || ''}`.trim()],
          city: order.city || '',
          state: order.state || '',
          zip_code: order.cep ? order.cep.replace(/\D/g, '') : '',
          country: 'BR',
        };

        // A Uber exige ao menos 1 item no manifesto; não enviamos os produtos, só um item genérico
        const manifestItems = [{ name: 'Pedido', quantity: 1 }];

        // Lógica de Pagamento: PIX/Pago (Só ida) vs Dinheiro/Cartão (Cobrar e retornar à loja)
        const isPaid = order.paymentStatus === 'PAID' || (order.paymentMethod && order.paymentMethod.toLowerCase().includes('pix'));
        const totalFormatted = Number(order.totalOrder || order.totalReceived || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const methodLabel = order.paymentMethod || 'Não informado';

        let driverPickupInstructions = config.pickupInstructions || 'Retirar no balcão de expedição.';
        let driverDropoffInstructions = order.observation || order.complement || '';

        if (!isPaid) {
          driverPickupInstructions += ` | [A COBRAR: ${totalFormatted} no ${methodLabel}] - ATENÇÃO: Levar maquininha/troco. OBRIGATÓRIO RETORNAR À LOJA com a maquininha ou o dinheiro recebido!`;
          driverDropoffInstructions = `[COBRAR NA ENTREGA: ${totalFormatted} no ${methodLabel}] - OBRIGATÓRIO RETORNAR À LOJA COM A MAQUININHA OU O PAGAMENTO. ` + driverDropoffInstructions;
        } else {
          driverPickupInstructions += ` | [PEDIDO JÁ PAGO VIA PIX/ONLINE] - Apenas retirar e entregar ao cliente (só ida).`;
          driverDropoffInstructions = `[PEDIDO JÁ PAGO VIA ${methodLabel.toUpperCase()}] - Apenas entregar o pacote ao cliente (só ida, não cobrar nada). ` + driverDropoffInstructions;
        }

        // A API da Uber Direct espera os campos de coleta/entrega planos (não aninhados)
        const body: any = {
          pickup_name: storeAddr.storeName || 'Loja',
          pickup_address: JSON.stringify(pickupAddress),
          pickup_phone_number: normalizeUberPhone(config.pickupPhone || storeAddr.phone),
          pickup_notes: driverPickupInstructions.trim(),
          dropoff_name: order.customerName || 'Cliente',
          dropoff_address: JSON.stringify(dropoffAddress),
          dropoff_phone_number: normalizeUberPhone(order.customerPhone),
          dropoff_notes: driverDropoffInstructions.trim(),
          manifest_items: manifestItems,
        };

        const endpoint = `https://api.uber.com/v1/customers/${config.customerId}/deliveries`;
        this.logger.log(`[UberDirect] Enviando corrida para pedido #${order.orderNumber} (${isPaid ? 'SÓ IDA' : 'COM RETORNO DE MAQUININHA'}) em ${endpoint}`);

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
          this.logger.error(`[UberDirect] Erro na criação da entrega para pedido #${order.orderNumber} (${response.status}): ${errorData}`);
          throw new Error(`Erro ao acionar Uber Direct (${response.status}): ${errorData}`);
        }

        const entrega = await response.json();

        // Atualiza o pedido no banco: ao receber o link de rastreio da Uber, salva e marca como DISPATCHED (ENVIADO).
        // Pedidos já concluídos/cancelados/enviados não têm o status alterado.
        const trackingUrl = entrega.tracking_url || entrega.trackingUrl;
        const canMoveToDispatched = order.status === 'PENDING' || order.status === 'CONFIRMED';
        const updatedOrder = await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: trackingUrl && canMoveToDispatched ? 'DISPATCHED' : order.status,
            uberDeliveryId: entrega.id,
            uberTrackingUrl: trackingUrl,
            uberDeliveryStatus: entrega.status || 'processing',
            uberDeliveryFee: entrega.fee ? Number(entrega.fee) / 100 : null,
            uberBatchId: batchId,
          },
          include: { items: true },
        });

        // Notifica painel de pedidos / kanban em tempo real
        try {
          this.eventsGateway.notifyOrderUpdated(updatedOrder);
          this.eventsGateway.server.emit('products.refresh');
        } catch (emitErr) {
          this.logger.warn(`[UberDirect] Falha ao emitir socket de atualização do pedido: ${emitErr.message}`);
        }

        results.push(entrega);
      } catch (err: any) {
        this.logger.error(`[UberDirect] Falha ao despachar pedido #${order.orderNumber}: ${err.message}`);
        if (orders.length === 1) throw err;
      }
    }

    if (results.length === 0 && orders.length > 0) {
      throw new Error('Falha ao acionar Uber Direct para todos os pedidos da rota');
    }

    return results[0];
  }

  /**
   * Processa o despacho automático inteligente de uma loja:
   * Se houver outros pedidos separados no mesmo rumo, agrupa em rota em linha reta.
   */
  async processStoreAutomaticDispatch(storeId: string, triggeringOrderId: string): Promise<any> {
    const config = await this.getStoreUberSettings(storeId);
    if (!config || !config.enabled || !config.autoDispatch) {
      return null;
    }

    // 1. Verificar se o pedido gatilho ainda existe e ainda não foi despachado
    const triggeringOrder = await this.prisma.order.findUnique({
      where: { id: triggeringOrderId },
      include: { items: true },
    });

    if (
      !triggeringOrder ||
      triggeringOrder.uberDeliveryId ||
      triggeringOrder.status !== 'CONFIRMED' ||
      triggeringOrder.deliveryModality !== 'DELIVERY'
    ) {
      return null;
    }

    // 2. Verificar se o pedido é elegível: APENAS PEDIDOS PAGOS (PIX ou Cartão Pago)
    const isPaid = triggeringOrder.paymentStatus === 'PAID' || 
                   (triggeringOrder.paymentMethod && triggeringOrder.paymentMethod.toLowerCase().includes('pix'));

    if (!isPaid) {
      this.logger.log(`[UberDirect Auto] Pedido #${triggeringOrder.orderNumber} não foi enviado para a Uber automaticamente pois o pagamento (${triggeringOrder.paymentMethod || 'não informado'}) é na entrega e exige retorno de maquininha/dinheiro à loja.`);
      return null;
    }

    // 2. Buscar todos os pedidos confirmados/separados aguardando envio desta loja (apenas PIX ou já pagos)
    const rawPendingOrders = await this.prisma.order.findMany({
      where: {
        storeId,
        status: 'CONFIRMED',
        deliveryModality: 'DELIVERY',
        uberDeliveryId: null,
      },
      include: { items: true },
    });

    const pendingOrders = rawPendingOrders.filter((o) => {
      return o.paymentStatus === 'PAID' || (o.paymentMethod && o.paymentMethod.toLowerCase().includes('pix'));
    });

    // Se só tem 1 pedido (ou nenhum outro), despacha individualmente
    if (pendingOrders.length <= 1) {
      return await this.dispatchUberDelivery(storeId, [triggeringOrder]);
    }

    // 3. Obter coordenadas da loja para cálculo dos rumos/azimutes
    const storeCoords = await this.geocodeWithFallbacks(config.storeAddress);
    if (!storeCoords) {
      // Sem coordenadas da loja não dá para agrupar por rumo: despacha só o pedido gatilho, sem abortar.
      this.logger.warn(
        '[UberDirect Auto] Não foi possível localizar o endereço da loja no mapa; enviando o pedido sem agrupar rotas.',
      );
      return await this.dispatchUberDelivery(storeId, [triggeringOrder]);
    }

    // 4. Agrupar todos os pedidos pendentes em rotas contínuas na mesma linha reta
    const routes = await this.groupOrdersIntoStraightRoutes(
      storeCoords,
      pendingOrders,
      config.batchSize || 3,
      config.maxAngleDelta || 45.0,
    );

    // 5. Encontrar a rota que contém o pedido gatilho
    const targetRoute = routes.find((r) => r.some((o) => o.id === triggeringOrderId));
    if (targetRoute && targetRoute.length > 0) {
      return await this.dispatchUberDelivery(storeId, targetRoute);
    }

    // Fallback: se não estiver em grupo específico, despacha o pedido gatilho
    return await this.dispatchUberDelivery(storeId, [triggeringOrder]);
  }
}
