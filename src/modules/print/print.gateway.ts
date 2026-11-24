import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../prisma/prisma.service';
import { printRoom } from '../events/socket-rooms';
import { findStoreByAgentToken, readAgentToken } from './print-token';

@WebSocketGateway({ cors: true })
export class PrintGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  private readonly logger = new Logger('PrintGateway');

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Só o agente com printToken válido entra na sala da loja. Este gateway divide o namespace com o
   * EventsGateway, então conexão sem token (painel, vitrine) é ignorada aqui, sem desconectar.
   * O antigo acesso só com `store_id` foi removido: quem soubesse o ID da loja recebia os pedidos dela.
   */
  async handleConnection(client: Socket) {
    const token = readAgentToken(client.handshake);
    if (!token) {
      if (client.handshake.query?.store_id) {
        this.logger.warn(`Conexão com store_id sem token recusada (Socket: ${client.id})`);
        client.emit('auth_error', { message: 'Token de impressão obrigatório' });
        client.disconnect();
      }
      return;
    }

    const store = await findStoreByAgentToken(this.prisma, token);

    if (!store) {
      this.logger.warn(`Token de impressão inválido (Socket: ${client.id})`);
      client.emit('auth_error', { message: 'Token de impressão inválido' });
      client.disconnect();
      return;
    }

    const storeId = store.id;
    const storeName = store.title;
    client.data.printStoreId = storeId;

    const sala = printRoom(storeId);
    await client.join(sala);
    console.log(`🖨️ Print Agent conectado! Loja: ${storeName || storeId} (Sala: ${sala}, Socket: ${client.id})`);
    
    // Auto-recuperação: Buscar pedidos da loja que não foram impressos
    try {
      const pedidosPendentes = await this.prisma.order.findMany({
        where: { storeId, isPrinted: false },
        include: {
          items: {
            include: {
              combo: true,
              product: {
                include: {
                  category: true,
                  images: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
                },
              },
            },
          },
        },
      });
      
      if (pedidosPendentes.length > 0) {
        console.log(`📦 Encontrados ${pedidosPendentes.length} pedidos pendentes para a loja ${storeName || storeId}. Disparando...`);
        for (const pedido of pedidosPendentes) {
          this.emitNovoPedido(storeId, pedido);
        }
      }
    } catch (error: any) {
      console.error('Erro ao buscar pedidos pendentes:', error.message);
    }
  }

  handleDisconnect(client: Socket) {
    if (client.data?.printStoreId) this.logger.log(`Print Agent desconectado (Socket: ${client.id})`);
  }

  // Envia o pedido para a sala da loja específica
  emitNovoPedido(storeId: string | number, pedido: any) {
    const sala = printRoom(String(storeId));
    console.log(`📤 Enviando pedido #${pedido.id} para a sala: ${sala}`);
    this.server.to(sala).emit('novo_pedido_imprimir', pedido);
  }

  @SubscribeMessage('marcar_como_impresso')
  async handleMarcarComoImpresso(@ConnectedSocket() client: Socket, @MessageBody() pedidoId: string) {
    // Só o agente autenticado, e só pedido da própria loja.
    const storeId = client.data?.printStoreId as string | undefined;
    if (!storeId || typeof pedidoId !== 'string' || !pedidoId) return;
    try {
      const { count } = await this.prisma.order.updateMany({
        where: { id: pedidoId, storeId },
        data: { isPrinted: true },
      });
      if (count === 0) this.logger.warn(`marcar_como_impresso ignorado: pedido ${pedidoId} não é da loja ${storeId}`);
    } catch (error: any) {
      this.logger.error(`Erro ao atualizar isPrinted do pedido #${pedidoId}: ${error.message}`);
    }
  }
}
