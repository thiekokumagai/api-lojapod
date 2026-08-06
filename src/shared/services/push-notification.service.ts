import { Injectable } from '@nestjs/common';
import * as webpush from 'web-push';
import { ISettingsRepository } from '../../modules/settings/domain/repositories/isettings.repository';

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:admin@podemais.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

@Injectable()
export class PushNotificationService {
  private expoClient: any = null;
  private ExpoClass: any = null;

  constructor(private readonly settingsRepo: ISettingsRepository) {}

  private async getExpoClient() {
    if (!this.expoClient) {
      const sdk = await (eval('import("expo-server-sdk")') as Promise<any>);
      this.ExpoClass = sdk.Expo;
      this.expoClient = new this.ExpoClass({ accessToken: process.env.EXPO_ACCESS_TOKEN });
    }
    return this.expoClient;
  }

  async sendNotifications(tokens: string[], title: string, body: string, data?: any, webSubscriptions: any[] = []) {
    // this.sendExpoPush(tokens, title, body, data).catch(console.error);
    this.sendWebPush(webSubscriptions, title, body, data).catch(console.error);
  }

  private async sendWebPush(subscriptions: any[], title: string, body: string, data?: any) {
    if (!subscriptions || subscriptions.length === 0) return;
    if (!process.env.VAPID_PUBLIC_KEY) return;

    const settings = await this.settingsRepo.get();
    let iconUrl = '/favicon-192x192.png';
    if (settings?.faviconUrl) {
      if (settings.faviconUrl.startsWith('http')) {
        iconUrl = settings.faviconUrl;
      } else if (process.env.MINIO_PUBLIC_URL && process.env.MINIO_BUCKET_NAME) {
        iconUrl = `${process.env.MINIO_PUBLIC_URL}/${process.env.MINIO_BUCKET_NAME}/${settings.faviconUrl}`;
      }
    }

    const payloadData = { ...(data || {}), icon: iconUrl };
    const payload = JSON.stringify({ title, body, data: payloadData });

    for (const sub of subscriptions) {
      if (!sub || !sub.endpoint) continue;
      try {
        await webpush.sendNotification(sub, payload);
      } catch (error) {
        console.error('Error sending web push:', error);
      }
    }
  }

  private async sendExpoPush(tokens: string[], title: string, body: string, data?: any) {
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
              console.error('Expo Push Error Code:', (ticket.details as any).error);
            }
          }
        }
      } catch (error) {
        console.error('Exception sending push notification chunk:', error);
      }
    }
  }
}
