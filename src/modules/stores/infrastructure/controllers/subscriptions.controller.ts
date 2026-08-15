import { Controller, Get, Post, Req, Res, HttpStatus, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { infinitePayService } from '../../domain/services/infinite-pay.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtém a fatura pendente atual da loja. Se não existir ou estiver expirada, cria uma nova.
   */
  @UseGuards(JwtAuthGuard)
  @Get('current-invoice')
  async getCurrentInvoice(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      const storeId = (req as any).user.storeId;
      if (!storeId) return res.status(HttpStatus.UNAUTHORIZED).json({ error: 'StoreId não encontrado' });

      const store = await this.prisma.store.findUnique({
        where: { id: storeId }
      });

      if (!store) return res.status(HttpStatus.NOT_FOUND).json({ error: 'Loja não encontrada' });

      // Procura uma fatura pendente
      let pendingInvoice = await this.prisma.storeInvoice.findFirst({
        where: {
          storeId,
          status: 'PENDING'
        },
        orderBy: { createdAt: 'desc' }
      });

      if (!pendingInvoice) {
        // Cria nova fatura
        const amount = store.monthlyFee ? Number(store.monthlyFee) : 99.90; // Default fallback se não setado

        pendingInvoice = await this.prisma.storeInvoice.create({
          data: {
            storeId,
            amount,
            status: 'PENDING',
            referenceMonth: new Date().toISOString().substring(0, 7) // "YYYY-MM"
          }
        });
      }

      // Se não tivermos um link do Pix/Checkout salvo, geramos
      if (!pendingInvoice.pixCopiaECola) { // usando pixCopiaECola pra salvar o link provisoriamente
        try {
          const checkoutUrl = await infinitePayService.createSubscriptionCheckout(storeId, pendingInvoice.id, Number(pendingInvoice.amount));
          
          pendingInvoice = await this.prisma.storeInvoice.update({
            where: { id: pendingInvoice.id },
            data: { pixCopiaECola: checkoutUrl }
          });
        } catch (error) {
          console.error("Erro ao gerar checkout da assinatura", error);
        }
      }

      return res.status(HttpStatus.OK).json({ invoice: pendingInvoice });
    } catch (error: any) {
      console.error(error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: error.message });
    }
  }

  /**
   * Webhook da InfinitePay
   */
  @Post('webhook/infinitepay')
  async infinitePayWebhook(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      const payload = req.body;
      console.log('Webhook InfinitePay Recebido:', payload);

      // A InfinitePay manda 'status' ou semelhante. O ideal é olhar a doc exata.
      // Assumindo que manda: { order_nsu: "ID_DA_FATURA", status: "paid" }
      const invoiceId = payload.order_nsu;
      const status = payload.status || payload.state;

      if (!invoiceId) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: 'order_nsu ausente' });
      }

      const isPaid = status === 'paid' || status === 'approved' || status === 'PAID';

      if (isPaid) {
        const invoice = await this.prisma.storeInvoice.findUnique({
          where: { id: invoiceId }
        });

        if (invoice && invoice.status !== 'PAID') {
          // Marca como PAGO
          await this.prisma.storeInvoice.update({
            where: { id: invoiceId },
            data: {
              status: 'PAID',
              paidAt: new Date()
            }
          });

          // Adiciona 1 mês na loja
          const store = await this.prisma.store.findUnique({ where: { id: invoice.storeId } });
          if (store) {
            let nextExpiration = store.subscriptionExpiresAt ? new Date(store.subscriptionExpiresAt) : new Date();
            // Se já tiver expirado há muito tempo, dá 1 mês a partir de hoje
            if (nextExpiration < new Date()) {
              nextExpiration = new Date();
            }
            nextExpiration.setMonth(nextExpiration.getMonth() + 1);

            await this.prisma.store.update({
              where: { id: store.id },
              data: {
                isActive: true,
                subscriptionExpiresAt: nextExpiration
              }
            });
            console.log(`Loja ${store.id} renovada até ${nextExpiration}`);
          }
        }
      }

      return res.status(HttpStatus.OK).send('OK');
    } catch (error: any) {
      console.error('Erro no webhook InfinitePay:', error);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: error.message });
    }
  }
}
