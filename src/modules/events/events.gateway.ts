import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { JwtPayload } from '../auth/infrastructure/types/jwt-payload.type';
import { catalogRoom, storeRoom } from './socket-rooms';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_ROOM_PREFIX = 'order:';
const CATALOG_ROOM_PREFIX = 'catalog:';
/** Teto de pedidos acompanhados por conexão (evita um cliente abrir salas sem fim). */
const MAX_ORDER_ROOMS_PER_CLIENT = 20;

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private logger: Logger = new Logger('EventsGateway');

  constructor(private readonly jwt: JwtService) {}

  afterInit(server: Server) {
    this.logger.log('EventsGateway initialized');
  }

  /**
   * O painel entra com `auth: { accessToken }` (o mesmo JWT do HTTP) e cai SÓ na sala da loja do token.
   * Sem token é conexão pública (vitrine, acompanhamento de pedido, agente de impressão): não entra em sala de loja.
   * Token inválido ou vencido recebe `session.invalid` para o painel renovar e reconectar.
   * Usa `accessToken` e não `token` porque o agente de impressão já manda `auth.token` com o printToken.
   */
  async handleConnection(client: Socket) {
    const accessToken = client.handshake?.auth?.accessToken;
    if (typeof accessToken !== 'string' || !accessToken) return;

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      this.logger.error('JWT_SECRET não definido: conexão do painel sem sala de loja');
      return;
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(accessToken, { secret });
    } catch {
      client.emit('session.invalid');
      return;
    }

    // Super admin sem loja no token não recebe evento de loja nenhuma (mesma regra do HTTP).
    if (!payload?.storeId) return;
    client.data.storeId = payload.storeId;
    await client.join(storeRoom(payload.storeId));
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /** Evento para o painel de UMA loja. Sem storeId não envia: nunca faz broadcast para todas as lojas. */
  emitToStore(storeId: string | null | undefined, event: string, payload?: unknown) {
    if (!storeId) {
      this.logger.warn(`Evento ${event} sem storeId: não enviado`);
      return;
    }
    const room = this.server?.to(storeRoom(storeId));
    if (!room) return;
    if (payload === undefined) room.emit(event);
    else room.emit(event, payload);
  }

  /** Catálogo mudou: avisa o painel e a vitrine da loja (sem payload). */
  notifyCatalogRefresh(storeId: string | null | undefined) {
    if (!storeId) {
      this.logger.warn('products.refresh sem storeId: não enviado');
      return;
    }
    this.server?.to([storeRoom(storeId), catalogRoom(storeId)]).emit('products.refresh');
  }

  notifyNewOrder(order: any) {
    this.emitToStore(order?.storeId, 'order.new', order);
  }

  notifyOrderUpdated(order: any) {
    this.emitToStore(order?.storeId, 'order.updated', order);
    this.notifyOrderStatus(order);
  }

  /**
   * Vitrine pede os avisos de catálogo da loja que está aberta. O storeId já é público
   * (vem em GET /store/settings) e a sala só recebe `products.refresh`, sem dado.
   */
  @SubscribeMessage('catalog.watch')
  handleCatalogWatch(@ConnectedSocket() client: Socket, @MessageBody() body: { storeId?: string }) {
    const storeId = typeof body?.storeId === 'string' ? body.storeId : '';
    if (!UUID_RE.test(storeId)) return { ok: false };
    for (const room of client.rooms) {
      if (room.startsWith(CATALOG_ROOM_PREFIX) && room !== catalogRoom(storeId)) void client.leave(room);
    }
    void client.join(catalogRoom(storeId));
    return { ok: true };
  }

  /**
   * Cliente da loja (checkout sem login) pede para acompanhar UM pedido.
   * Quem conhece o orderId (UUID) entra na sala dele — o mesmo critério do GET /store/orders/:id.
   */
  @SubscribeMessage('order.watch')
  handleOrderWatch(@ConnectedSocket() client: Socket, @MessageBody() body: { orderId?: string }) {
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    if (!UUID_RE.test(orderId)) return { ok: false };
    const room = ORDER_ROOM_PREFIX + orderId.toLowerCase();
    const watching = [...client.rooms].filter((r) => r.startsWith(ORDER_ROOM_PREFIX)).length;
    if (!client.rooms.has(room) && watching >= MAX_ORDER_ROOMS_PER_CLIENT) return { ok: false };
    void client.join(room);
    return { ok: true };
  }

  @SubscribeMessage('order.unwatch')
  handleOrderUnwatch(@ConnectedSocket() client: Socket, @MessageBody() body: { orderId?: string }) {
    if (typeof body?.orderId === 'string') void client.leave(ORDER_ROOM_PREFIX + body.orderId.toLowerCase());
    return { ok: true };
  }

  /**
   * Status do pedido para o cliente. Vai SÓ para a sala do pedido (nunca broadcast) e leva
   * apenas { orderId, status, paymentStatus, updatedAt } — sem dado pessoal, itens ou preço.
   */
  notifyOrderStatus(order: any) {
    if (!order?.id || !order.status) return;
    const updatedAt = order.updatedAt instanceof Date ? order.updatedAt.toISOString() : new Date().toISOString();
    this.server
      ?.to(ORDER_ROOM_PREFIX + String(order.id).toLowerCase())
      .emit('order.status', {
        orderId: order.id,
        status: order.status,
        paymentStatus: order.paymentStatus ?? null,
        updatedAt,
      });
  }

  notifyStockNotificationRequest(notification: any) {
    this.emitToStore(notification?.storeId, 'stock_notification.new', notification);
  }

  notifyStockNotificationUpdated(notification: any) {
    this.emitToStore(notification?.storeId, 'stock_notification.updated', notification);
  }

  notifyStockNotificationDeleted(storeId: string | null | undefined, id: string) {
    this.emitToStore(storeId, 'stock_notification.deleted', { id });
  }
}
