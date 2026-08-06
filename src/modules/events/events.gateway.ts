import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';

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
  }

  notifyProductStockUpdate(productId: string, stock: number) {
    this.logger.log(`Emitting product.stock_updated event for ${productId}`);
    this.server.emit('product.stock_updated', { productId, stock });
  }
}
