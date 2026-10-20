import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { LoyaltyService } from '../../domain/loyalty.service';
import { AuthGuard } from '@nestjs/passport';
import { UpdateLoyaltyProgramDto } from '../../application/dto/update-loyalty-program.dto';
import { ManualAdjustStampDto } from '../../application/dto/manual-adjust-stamp.dto';

@Controller('loyalty')
@UseGuards(AuthGuard('jwt'))
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Get('program')
  async getProgram() {
    return this.loyaltyService.getProgram();
  }

  @Post('program')
  async updateProgram(@Body() dto: UpdateLoyaltyProgramDto) {
    return this.loyaltyService.updateProgram(dto);
  }

  @Get('card')
  async getCard(@Query('phone') phone?: string) {
    return this.loyaltyService.getCustomerCard(phone);
  }

  @Get('cards')
  async listCards(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.loyaltyService.listCards({
      search,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('adjust')
  async manualAdjust(@Body() dto: ManualAdjustStampDto) {
    return this.loyaltyService.manualAdjust(dto);
  }

  @Get('redemptions')
  async listRedemptions(@Query('status') status?: string) {
    return this.loyaltyService.listRedemptions(status);
  }

  @Post('redemptions/:id/deliver')
  async markDelivered(@Query('id') queryId: string, @Body('id') bodyId: string) {
    const id = bodyId || queryId;
    return this.loyaltyService.markRedemptionDelivered(id);
  }
}
