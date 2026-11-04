import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/infrastructure/guards/jwt-auth.guard';
import { TenantContextService } from '../tenant/tenant-context.service';
import { UberDirectService } from './uber-direct.service';
import { PrismaService } from '../../../prisma/prisma.service';

@ApiTags('Uber Direct')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('uber')
export class UberController {
  constructor(
    private readonly uberService: UberDirectService,
    private readonly tenantContextService: TenantContextService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Consultar configurações e status da integração com Uber Direct' })
  async getStatus() {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }
    const settings = await this.uberService.getStoreUberSettings(storeId);
    return {
      enabled: !!settings?.enabled,
      autoDispatch: !!settings?.autoDispatch,
      environment: settings?.environment || 'sandbox',
      hasCredentials: !!(settings?.clientId && settings?.clientSecret && settings?.customerId),
      batchSize: settings?.batchSize || 3,
      maxAngleDelta: settings?.maxAngleDelta || 45,
    };
  }

  @Post('orders/:id/dispatch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Chamar Uber Direct manualmente para um pedido específico' })
  async dispatchSingle(@Param('id') id: string) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }

    const order = await this.prisma.order.findFirst({
      where: { id, storeId },
      include: { items: true },
    });

    if (!order) {
      throw new BadRequestException('Pedido não encontrado para esta loja');
    }

    const result = await this.uberService.dispatchUberDelivery(storeId, [order]);
    return {
      success: true,
      deliveryId: result.id,
      trackingUrl: result.tracking_url || result.trackingUrl,
      status: result.status,
    };
  }

  @Post('dispatch-routes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Agrupa pedidos separados em rotas no mesmo rumo e dispara Uber' })
  async dispatchBatchedRoutes(@Body() body: { orderIds?: string[] }) {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja não informado');
    }

    const config = await this.uberService.getStoreUberSettings(storeId);
    if (!config || !config.enabled) {
      throw new BadRequestException('Uber Direct não está ativado nas configurações da loja.');
    }

    // Buscar pedidos para envio
    const where: any = {
      storeId,
      deliveryModality: 'DELIVERY',
    };

    if (body.orderIds && body.orderIds.length > 0) {
      where.id = { in: body.orderIds };
    } else {
      // Default: todos com status CONFIRMED (Separado) que ainda não tenham uberDeliveryId
      where.status = 'CONFIRMED';
      where.uberDeliveryId = null;
    }

    let orders = await this.prisma.order.findMany({
      where,
      include: { items: true },
    });

    // Se nenhum pedido foi selecionado manualmente, incluir apenas pedidos pagos (PIX ou Cartão online)
    if (!body.orderIds || body.orderIds.length === 0) {
      orders = orders.filter((o) => o.paymentStatus === 'PAID' || (o.paymentMethod && o.paymentMethod.toLowerCase().includes('pix')));
    }

    if (orders.length === 0) {
      return {
        message: 'Nenhum pedido elegível encontrado para despacho.',
        dispatchedRoutes: 0,
        ordersCount: 0,
      };
    }

    // Geocodificar a loja
    const storeAddr = `${config.storeAddress.street}, ${config.storeAddress.number}, ${config.storeAddress.neighborhood}, ${config.storeAddress.city} - ${config.storeAddress.state}`;
    let storeCoords = await this.uberService.geocodeAddress(storeAddr);

    if (!storeCoords) {
      throw new BadRequestException(
        `Não foi possível localizar o endereço da loja para integração com Uber Direct: ${storeAddr}. Verifique o endereço cadastrado nas configurações.`,
      );
    }

    // Agrupar pedidos em rotas com mesmo rumo
    const groupedRoutes = await this.uberService.groupOrdersIntoStraightRoutes(
      storeCoords,
      orders,
      config.batchSize,
      config.maxAngleDelta,
    );

    const dispatchedResults: any[] = [];
    for (const routeOrders of groupedRoutes) {
      try {
        const deliveryResult = await this.uberService.dispatchUberDelivery(storeId, routeOrders);
        dispatchedResults.push({
          success: true,
          deliveryId: deliveryResult.id,
          trackingUrl: deliveryResult.tracking_url || deliveryResult.trackingUrl,
          orderNumbers: routeOrders.map((o) => o.orderNumber),
        });
      } catch (err: any) {
        dispatchedResults.push({
          success: false,
          error: err.message,
          orderNumbers: routeOrders.map((o) => o.orderNumber),
        });
      }
    }

    return {
      message: `Processamento de rotas concluído. ${dispatchedResults.length} grupo(s) processado(s).`,
      results: dispatchedResults,
    };
  }
}
