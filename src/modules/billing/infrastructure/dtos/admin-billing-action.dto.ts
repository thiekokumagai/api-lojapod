import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class AdminBillingActionDto {
  @ApiProperty({ enum: ['SUSPEND', 'REACTIVATE', 'CANCEL'] })
  @IsIn(['SUSPEND', 'REACTIVATE', 'CANCEL'])
  action: 'SUSPEND' | 'REACTIVATE' | 'CANCEL';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  reason: string;
}
