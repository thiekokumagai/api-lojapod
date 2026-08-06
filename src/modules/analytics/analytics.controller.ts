import { Controller, Post, Body } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Post('session')
  async trackSession(@Body('sessionId') sessionId: string) {
    if (!sessionId) return { success: false };
    await this.analyticsService.trackSession(sessionId);
    return { success: true };
  }

  @Post('cart')
  async trackCart(
    @Body('sessionId') sessionId: string,
    @Body('cartItems') cartItems: any[],
    @Body('totalAmount') totalAmount: number
  ) {
    if (!sessionId) return { success: false };
    await this.analyticsService.trackCart(sessionId, cartItems, totalAmount || 0);
    return { success: true };
  }
}
