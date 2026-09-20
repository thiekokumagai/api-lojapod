/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class VendizapService {
  private readonly logger = new Logger(VendizapService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async getClient(storeId?: string): Promise<AxiosInstance> {
    let authId = process.env.VENDIZAP_AUTH_ID || '906795';
    let authSecret = process.env.VENDIZAP_AUTH_SECRET || 'GHMla7Nebr#uITLn0jA9tCy?FJx%UBh1';

    if (storeId) {
      const settings = await this.prisma.storeSettings.findUnique({
        where: { storeId }
      });
      if (settings?.vendizapAuthId && settings?.vendizapAuthSecret) {
        authId = settings.vendizapAuthId;
        authSecret = settings.vendizapAuthSecret;
      }
    }

    return axios.create({
      baseURL: process.env.VENDIZAP_API_URL || 'https://app.vendizap.com/api',
      headers: {
        'X-Auth-Id': authId,
        'X-Auth-Secret': authSecret,
      },
    });
  }

  async getCategories(storeId?: string) {
    try {
      const client = await this.getClient(storeId);
      const response = await client.get('/categorias');
      return response.data;
    } catch (error) {
      this.logger.error(
        'Error fetching categories from Vendizap',
        error.message,
      );
      throw error;
    }
  }

  async getProducts(skip: number = 0, limit: number = 100, storeId?: string) {
    try {
      const client = await this.getClient(storeId);
      const response = await client.get('/produtos', {
        params: { skip, limit },
      });
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching products from Vendizap', error.message);
      throw error;
    }
  }

  async getProductById(id: string, storeId?: string) {
    try {
      const client = await this.getClient(storeId);
      const response = await client.get(`/produtos/${id}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        `Error fetching product ${id} from Vendizap`,
        error.message,
      );
      throw error;
    }
  }

  async getOrders(params?: {
    tipoData?: string;
    dataInicial?: string;
    dataFinal?: string;
    cancelados?: boolean;
    somenteNovos?: boolean;
    skip?: number;
    limit?: number;
  }, storeId?: string) {
    try {
      const client = await this.getClient(storeId);
      const response = await client.get('/pedidos', { params });
      return response.data;
    } catch (error) {
      this.logger.error('Error fetching orders from Vendizap', error.message);
      throw error;
    }
  }
}
