import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../../prisma/prisma.service';

@WebSocketGateway({ cors: true })
export class PrintGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token || client.handshake.query?.token || client.handshake.query?.print_token) as string;
    let storeId = client.handshake.query.store_id as string;
    let storeName = '';

    if (token) {
      const cleanToken = token.trim();
      const store = await this.prisma.store.findFirst({
        where: {
          OR: [
            { printToken: { equals: cleanToken, mode: 'insensitive' } },
            { printToken: { equals: cleanToken.toUpperCase(), mode: 'insensitive' } },
          ],
        },
      });

      if (store) {
        storeId = store.id;
        storeName = store.title;
      } else {
        console.warn(`⚠️ Connection rejected: Invalid print token "${token}" (Socket: ${client.id})`);
        client.emit('auth_error', { message: 'Token de impressão inválido' });
        client.disconnect();
        return;
      }
    } else if (storeId) {
      const store = await this.prisma.store.findUnique({
        where: { id: storeId },
      });
      if (store) {
        storeName = store.title;
      }
    }

    if (storeId) {
      const sala = `loja_${storeId}`;
      client.join(sala);
      console.log(`🖨️ Print Agent conectado! Loja: ${storeName || storeId} (Sala: ${sala}, Socket: ${client.id})`);
      
      // Auto-recuperação: Buscar pedidos da loja que não foram impressos
      try {
        const pedidosPendentes = await this.prisma.order.findMany({
          where: { storeId, isPrinted: false },
          include: { items: true },
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
      
    } else {
      console.warn(`⚠️ Print Agent conectou sem token ou store_id (Socket: ${client.id})`);
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`🔌 Print Agent desconectado (Socket: ${client.id})`);
  }

  // Envia o pedido para a sala da loja específica
  emitNovoPedido(storeId: string | number, pedido: any) {
    const sala = `loja_${storeId}`;
    console.log(`📤 Enviando pedido #${pedido.id} para a sala: ${sala}`);
    this.server.to(sala).emit('novo_pedido_imprimir', pedido);
  }

  @SubscribeMessage('marcar_como_impresso')
  async handleMarcarComoImpresso(client: Socket, pedidoId: string) {
    try {
      await this.prisma.order.update({
        where: { id: pedidoId },
        data: { isPrinted: true },
      });
      console.log(`✅ Status isPrinted=true atualizado para o pedido #${pedidoId}`);
    } catch (error: any) {
      console.error(`❌ Erro ao atualizar isPrinted do pedido #${pedidoId}`, error.message);
    }
  }
}
