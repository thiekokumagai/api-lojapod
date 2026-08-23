import { Body, Controller, Delete, Get, Headers, Ip, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/infrastructure/guards/jwt-auth.guard';
import { AllowInactive } from '../auth/infrastructure/decorators/allow-inactive.decorator';
import { Public } from '../auth/infrastructure/decorators/public.decorator';
import { BillingService } from './billing.service';
import { AdminBillingActionDto } from './infrastructure/dtos/admin-billing-action.dto';
import { CreatePlanDto } from './infrastructure/dtos/create-plan.dto';
import { UpdatePlanDto } from './infrastructure/dtos/update-plan.dto';
import { UpdateStoreSubscriptionDto } from './infrastructure/dtos/update-store-subscription.dto';
import { SuperAdminGuard } from './infrastructure/guards/super-admin.guard';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('plans')
  @Public()
  @ApiOperation({ summary: 'Listar planos públicos ativos' })
  listPublicPlans() {
    return this.billing.listPublicPlans();
  }

  @Get('my-subscription')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard)
  @AllowInactive()
  @ApiOperation({ summary: 'Obter detalhes da assinatura e histórico financeiro da loja' })
  getMySubscription(@Req() req: Request & { user: { storeId?: string } }) {
    if (!req.user.storeId) return null;
    return this.billing.getMySubscription(req.user.storeId);
  }

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
  checkout(
    @Req() req: Request & { user: { storeId?: string } },
    @Query('plan') plan?: string,
    @Query('planId') planId?: string,
  ) {
    if (!req.user.storeId) return { checkoutUrl: null };
    return this.billing.getCheckout(req.user.storeId, planId || plan);
  }

  @Get('admin/plans')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Listar todos os planos (Super Admin)' })
  listAdminPlans() {
    return this.billing.listAdminPlans();
  }

  @Post('admin/plans/sync-cakto')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Sincronizar e importar produtos diretamente da API da Cakto' })
  syncCaktoProducts() {
    return this.billing.syncCaktoProducts();
  }

  @Post('admin/plans')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Criar novo plano (Super Admin)' })
  createPlan(@Body() dto: CreatePlanDto) {
    return this.billing.createPlan(dto);
  }

  @Put('admin/plans/:id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Atualizar plano (Super Admin)' })
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.billing.updatePlan(id, dto);
  }

  @Delete('admin/plans/:id')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Desativar plano (Super Admin)' })
  deletePlan(@Param('id') id: string) {
    return this.billing.deletePlan(id);
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

  @Put('admin/stores/:storeId/subscription')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Editar dados da assinatura de uma loja (Super Admin)' })
  updateSubscription(@Param('storeId') storeId: string, @Body() dto: UpdateStoreSubscriptionDto) {
    return this.billing.updateStoreSubscription(storeId, dto);
  }

  @Get('admin/payments')
  @ApiBearerAuth('access-token')
  @UseGuards(JwtAuthGuard, SuperAdminGuard)
  @ApiOperation({ summary: 'Listar histórico de todas as transações e pagamentos das lojas (Super Admin)' })
  payments() {
    return this.billing.listAllPayments();
  }
}
