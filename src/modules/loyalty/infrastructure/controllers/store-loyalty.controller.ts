import { Controller, Get, Post, Body, Query, BadRequestException } from '@nestjs/common';
import { LoyaltyService } from '../../domain/loyalty.service';

@Controller('store/loyalty')
export class StoreLoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('card')
  async getCard(@Query('phone') phone?: string) {
    return this.loyaltyService.getCustomerCard(phone);
  }

  @Post('redeem')
  async redeemReward(
    @Body('phone') phone: string,
    @Body('rewardType') rewardType?: string,
    @Body('rewardTitle') rewardTitle?: string,
    @Body('orderId') orderId?: string,
  ) {
    if (!phone) {
      throw new BadRequestException('Telefone do cliente é obrigatório');
    }
    return this.loyaltyService.redeemReward(phone, { rewardType, rewardTitle, orderId });
  }
}
