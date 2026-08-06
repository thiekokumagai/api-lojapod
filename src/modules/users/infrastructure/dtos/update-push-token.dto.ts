import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePushTokenDto {
  @ApiProperty({ description: 'O Expo Push Token obtido no celular' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
