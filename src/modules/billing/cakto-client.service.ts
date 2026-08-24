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

  getCheckoutUrl(plan?: 'SETUP_ERP' | 'MONTHLY'): string | null {
    if (plan === 'SETUP_ERP') {
      return this.config.get('CAKTO_CHECKOUT_SETUP_URL') || this.config.get('CAKTO_CHECKOUT_URL') || null;
    }
    return this.config.get('CAKTO_CHECKOUT_SUBSCRIPTION_URL') || this.config.get('CAKTO_CHECKOUT_URL') || null;
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

  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    data?: unknown,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const token = await this.getAccessToken();
    try {
      const response = await this.http.request<T>({
        method,
        url,
        data,
        params,
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        this.accessToken = undefined;
      }
      const responseData = axios.isAxiosError(error) ? error.response?.data : null;
      const detail = responseData
        ? (typeof responseData === 'object' ? JSON.stringify(responseData) : String(responseData))
        : (error instanceof Error ? error.message : 'Falha na comunicação com a Cakto');
      throw new BadGatewayException(`Erro Cakto: ${detail}`);
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

  listProducts(params?: Record<string, unknown>): Promise<any> {
    return this.request('GET', '/public_api/products/', undefined, params);
  }

  listOffers(params?: Record<string, unknown>): Promise<any> {
    return this.request('GET', '/public_api/offers/', undefined, params);
  }

  listSubscriptions(): Promise<any> {
    return this.request('GET', '/public_api/subscriptions/');
  }

  listOrders(): Promise<any> {
    return this.request('GET', '/public_api/orders/');
  }

  createProduct(data: Record<string, unknown>): Promise<any> {
    return this.request('POST', '/public_api/products/', data);
  }

  updateProduct(id: string, data: Record<string, unknown>): Promise<any> {
    return this.request('PUT', `/public_api/products/${encodeURIComponent(id)}/`, data);
  }

  updateOffer(id: string, data: Record<string, unknown>): Promise<any> {
    return this.request('PUT', `/public_api/offers/${encodeURIComponent(id)}/`, data);
  }
}
