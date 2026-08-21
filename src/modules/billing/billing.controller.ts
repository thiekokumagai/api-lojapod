import { Body, Controller, Get, Headers, Ip, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/infrastructure/guards/jwt-auth.guard';
import { AllowInactive } from '../auth/decorators/allow-inactive.decorator';
import { BillingService } from './billing.service';
import { AdminBillingActionDto } from './infrastructure/dtos/admin-billing-action.dto';
import { SuperAdminGuard } from './infrastructure/guards/super-admin.guard';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('webhooks/cakto')
  @ApiOperation({ summary: 'Recebe eventos da Cakto' })
  webhook(@Body() body: Record<string, unknown>, @Headers('x-cakto-secret') secret?: string) {
    this.billing.validateWebhookSecret(secret, typeof body.secret === 'string' ? body.secret : undefined);
    return this.billing.processWebhook(body);
  }

  @Get('checkout')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @AllowInactive()
  checkout(@Req() req: Request & { user: { storeId?: string } }) {
    if (!req.user.storeId) return { checkoutUrl: null };
    return this.billing.getCheckout(req.user.storeId);
  }

  @Get('admin/overview')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  overview() { return this.billing.overview(); }

  @Get('admin/subscriptions')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  subscriptions() { return this.billing.listSubscriptions(); }

  @Post('admin/stores/:storeId/action')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  action(@Param('storeId') storeId: string, @Body() dto: AdminBillingActionDto, @Req() req: Request & { user: { sub: string } }, @Ip() ip: string) {
    return this.billing.adminAction(storeId, dto.action, dto.reason, req.user.sub, ip);
  }
}
