import { Injectable } from '@nestjs/common';
import axios, { AxiosError } from 'axios';

/** Campos do pagamento do Mercado Pago que o lojapod usa (a API devolve muito mais). */
export interface MercadoPagoPayment {
  id: number | string;
  status: string;
  status_detail?: string;
  transaction_amount: number;
  external_reference?: string | null;
  installments?: number;
  payment_method_id?: string;
  payment_type_id?: string;
  date_of_expiration?: string | null;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
      ticket_url?: string;
    };
  };
}

/** Erro da API do Mercado Pago. Nunca carrega o access token. */
export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly mpMessage?: string,
  ) {
    super(message);
    this.name = 'MercadoPagoApiError';
  }
}

/**
 * Cliente HTTP fino da API do Mercado Pago. O token vem por chamada (é da loja, não do sistema).
 * Os testes trocam esta classe por um mock: nenhuma chamada real sai deles.
 */
@Injectable()
export class MercadoPagoClient {
  private readonly baseUrl = 'https://api.mercadopago.com';

  async createPayment(
    accessToken: string,
    body: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>(accessToken, {
      method: 'POST',
      url: '/v1/payments',
      data: body,
      headers: { 'X-Idempotency-Key': idempotencyKey },
    });
  }

  async getPayment(
    accessToken: string,
    paymentId: string | number,
  ): Promise<MercadoPagoPayment> {
    return this.request<MercadoPagoPayment>(accessToken, {
      method: 'GET',
      url: `/v1/payments/${encodeURIComponent(String(paymentId))}`,
    });
  }

  private async request<T>(
    accessToken: string,
    config: {
      method: 'GET' | 'POST';
      url: string;
      data?: unknown;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    try {
      const response = await axios.request<T>({
        baseURL: this.baseUrl,
        timeout: 15000,
        ...config,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...config.headers,
        },
      });
      return response.data;
    } catch (err) {
      const e = err as AxiosError<{ message?: string }>;
      throw new MercadoPagoApiError(
        'Falha ao falar com o Mercado Pago',
        e.response?.status,
        e.response?.data?.message,
      );
    }
  }
}
