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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_ROOM_PREFIX = 'order:';
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

  afterInit(server: Server) {
    this.logger.log('EventsGateway initialized');
  }

  handleConnection(client: Socket, ...args: any[]) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  notifyNewOrder(order: any) {
    this.logger.log('Emitting order.new event');
    this.server.emit('order.new', order);
  }

  notifyOrderUpdated(order: any) {
    this.logger.log(`Emitting order.updated event for ${order?.id}`);
    this.server.emit('order.updated', order);
    this.notifyOrderStatus(order);
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

  notifyProductStockUpdate(productId: string, stock: number) {
    this.logger.log(`Emitting product.stock_updated event for ${productId}`);
    this.server.emit('product.stock_updated', { productId, stock });
  }

  notifyStockNotificationRequest(notification: any) {
    this.logger.log(`Emitting stock_notification.new event for ${notification?.id}`);
    this.server.emit('stock_notification.new', notification);
  }

  notifyStockNotificationUpdated(notification: any) {
    this.logger.log(`Emitting stock_notification.updated event for ${notification?.id}`);
    this.server.emit('stock_notification.updated', notification);
  }

  notifyStockNotificationDeleted(id: string) {
    this.logger.log(`Emitting stock_notification.deleted event for ${id}`);
    this.server.emit('stock_notification.deleted', { id });
  }
}
