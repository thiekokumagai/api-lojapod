import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

@Injectable()
export class CaktoClientService {
  private readonly http: AxiosInstance;
  private accessToken?: string;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.get('CAKTO_API_URL') || 'https://api.cakto.com.br',
      timeout: 15000,
    });
  }

  isConfigured(): boolean {
    return Boolean(this.config.get('CAKTO_CLIENT_ID') && this.config.get('CAKTO_CLIENT_SECRET'));
  }

  getCheckoutUrl(): string | null {
    return this.config.get('CAKTO_CHECKOUT_URL') || null;
  }

  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Integração Cakto ainda não configurada');
    }

    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return this.accessToken;

    try {
      const body = new URLSearchParams({
        client_id: this.config.getOrThrow('CAKTO_CLIENT_ID'),
        client_secret: this.config.getOrThrow('CAKTO_CLIENT_SECRET'),
      });
      const { data } = await this.http.post<TokenResponse>('/public_api/token/', body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      this.accessToken = data.access_token;
      this.accessTokenExpiresAt = Date.now() + Math.max(60, data.expires_in - 300) * 1000;
      return data.access_token;
    } catch {
      throw new BadGatewayException('Não foi possível autenticar na Cakto');
    }
  }

  private async request<T>(method: 'GET' | 'POST', url: string, data?: unknown): Promise<T> {
    const token = await this.getAccessToken();
    try {
      const response = await this.http.request<T>({
        method,
        url,
        data,
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.accessToken = undefined;
      }
      throw new BadGatewayException('Falha na comunicação com a Cakto');
    }
  }

  getSubscription(id: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/public_api/subscriptions/${encodeURIComponent(id)}/`);
  }

  cancelSubscription(id: string): Promise<Record<string, unknown>> {
    return this.request('POST', `/public_api/subscriptions/${encodeURIComponent(id)}/cancel/`);
  }

  getOrder(id: string): Promise<Record<string, unknown>> {
    return this.request('GET', `/public_api/orders/${encodeURIComponent(id)}/`);
  }
}
