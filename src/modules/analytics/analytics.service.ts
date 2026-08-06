import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async trackSession(sessionId: string) {
    const now = new Date();
    const session = await this.prisma.storeSession.upsert({
      where: { sessionId },
      create: { sessionId, startedAt: now, lastHeartbeatAt: now },
      update: { lastHeartbeatAt: now }
    });

    const diffSeconds = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
    
    if (session.durationSeconds !== diffSeconds) {
      return this.prisma.storeSession.update({
        where: { sessionId },
        data: { durationSeconds: diffSeconds }
      });
    }

    return session;
  }

  async trackCart(sessionId: string, cartItems: any[], totalAmount: number) {
    await this.trackSession(sessionId);

    if (!cartItems || cartItems.length === 0) {
      const existing = await this.prisma.cartDraft.findUnique({ where: { sessionId } });
      if (existing) {
        await this.prisma.cartDraft.delete({ where: { sessionId } });
      }
      return;
    }

    return this.prisma.cartDraft.upsert({
      where: { sessionId },
      create: {
        sessionId,
        cartItems: cartItems as any,
        totalAmount
      },
      update: {
        cartItems: cartItems as any,
        totalAmount
      }
    });
  }
}
