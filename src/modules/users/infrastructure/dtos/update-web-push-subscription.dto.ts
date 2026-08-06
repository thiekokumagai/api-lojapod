import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsObject } from 'class-validator';

export class UpdateWebPushSubscriptionDto {
  @ApiProperty({ description: 'Web Push Subscription object' })
  @IsDefined()
  @IsObject()
  subscription: any;
}
