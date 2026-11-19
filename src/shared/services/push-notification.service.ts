import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ISettingsRepository } from '../../modules/settings/domain/repositories/isettings.repository';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@podemais.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
}

@Injectable()
export class PushNotificationService {
  private expoClient: any = null;
  private ExpoClass: any = null;

  constructor(
    private readonly settingsRepo: ISettingsRepository,
    private readonly prisma: PrismaService,
  ) {}

  private async getExpoClient() {
    if (!this.expoClient) {
      const sdk = await (eval('import("expo-server-sdk")') as Promise<any>);
      this.ExpoClass = sdk.Expo;
      this.expoClient = new this.ExpoClass({
        accessToken: process.env.EXPO_ACCESS_TOKEN,
      });
    }
    return this.expoClient;
  }

  async sendNotifications(
    tokens: string[],
    title: string,
    body: string,
    data?: any,
    webSubscriptions: any[] = [],
  ) {
    // this.sendExpoPush(tokens, title, body, data).catch(console.error);
    this.sendWebPush(webSubscriptions, title, body, data).catch(console.error);
  }

  private async sendWebPush(
    subscriptions: any[],
    title: string,
    body: string,
    data?: any,
  ) {
    if (!subscriptions || subscriptions.length === 0) return;
    if (!process.env.VAPID_PUBLIC_KEY) return;

    const settings = await this.settingsRepo.get();
    const adminFrontendUrl = (process.env.ADMIN_FRONTEND_URL || '').replace(
      /\/$/,
      '',
    );
    let iconUrl = adminFrontendUrl
      ? `${adminFrontendUrl}/favicon-192x192.png`
      : '/favicon-192x192.png';
    if (settings?.faviconUrl) {
      if (settings.faviconUrl.startsWith('http')) {
        iconUrl = settings.faviconUrl;
      } else if (process.env.MINIO_PUBLIC_URL && process.env.MINIO_BUCKET) {
        iconUrl = `${process.env.MINIO_PUBLIC_URL}/${process.env.MINIO_BUCKET}/${settings.faviconUrl}`;
      }
    }

    const payloadData = { ...(data || {}), icon: iconUrl };
    const payload = JSON.stringify({ title, body, data: payloadData });

    // Endpoints que o serviço de push informou como expirados (404/410)
    const expiredEndpoints = new Set<string>();

    for (const sub of subscriptions) {
      if (!sub || !sub.endpoint) continue;
      try {
        await webpush.sendNotification(sub, payload);
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          // Inscrição morta (usuário desinstalou o app ou revogou a permissão): não é erro de verdade
          expiredEndpoints.add(sub.endpoint);
        } else {
          // Log curto: o objeto de erro completo traz dezenas de linhas de headers
          console.error(
            `Error sending web push: status=${error?.statusCode ?? 'n/a'} ${error?.message ?? error}`,
          );
        }
      }
    }

    if (expiredEndpoints.size > 0) {
      await this.removeExpiredSubscriptions(expiredEndpoints).catch((err) =>
        console.error('Error removing expired web push subscriptions:', err?.message ?? err),
      );
    }
  }

  // Remove do cadastro dos usuários as inscrições que já não existem mais
  private async removeExpiredSubscriptions(endpoints: Set<string>) {
    const users = await this.prisma.user.findMany({
      where: { webPushSubscription: { not: Prisma.DbNull } },
      select: { id: true, webPushSubscription: true },
    });

    let removed = 0;
    for (const user of users) {
      const current = Array.isArray(user.webPushSubscription)
        ? (user.webPushSubscription as any[])
        : [user.webPushSubscription as any];
      const kept = current.filter((s) => !(s && endpoints.has(s.endpoint)));
      if (kept.length === current.length) continue;

      removed += current.length - kept.length;
      await this.prisma.user.update({
        where: { id: user.id },
        data: { webPushSubscription: kept.length > 0 ? kept : Prisma.DbNull },
      });
    }

    console.log(`Web push: ${removed} inscrição(ões) expirada(s) removida(s).`);
  }

  private async sendExpoPush(
    tokens: string[],
    title: string,
    body: string,
    data?: any,
  ) {
    if (!tokens || tokens.length === 0) return;

    const expo = await this.getExpoClient();
    const messages: any[] = [];

    for (const pushToken of tokens) {
      if (!this.ExpoClass.isExpoPushToken(pushToken)) {
        console.error(`Push token ${pushToken} is not a valid Expo push token`);
        continue;
      }
      messages.push({
        to: pushToken,
        sound: 'default',
        channelId: 'default',
        title,
        body,
        data,
      });
    }

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const ticketChunks = await expo.sendPushNotificationsAsync(chunk);
        console.log('Push notification tickets:', ticketChunks);
        for (const ticket of ticketChunks) {
          if (ticket.status === 'error') {
            console.error('Expo Push Error (Ticket):', ticket.message);
            if (ticket.details && (ticket.details as any).error) {
              console.error(
                'Expo Push Error Code:',
                (ticket.details as any).error,
              );
            }
          }
        }
      } catch (error) {
        console.error('Exception sending push notification chunk:', error);
      }
    }
  }
}
