import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePasswordDto {
  @ApiProperty({ description: 'Senha atual do usuário' })
  @IsString()
  @MinLength(6, { message: 'A senha atual deve ter pelo menos 6 caracteres' })
  currentPassword: string;

  @ApiProperty({ description: 'Nova senha do usuário' })
  @IsString()
  @MinLength(6, { message: 'A nova senha deve ter pelo menos 6 caracteres' })
  newPassword: string;
}
