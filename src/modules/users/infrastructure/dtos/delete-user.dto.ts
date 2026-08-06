import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DeleteUserDto {
  @ApiProperty({ example: 'uuid-do-usuario' })
  @IsUUID()
  id: string;
}
