import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { SCREEN_PERMISSION_KEYS } from '../../../auth/permissions/screen-permissions';

export class CreateUserDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(1, { message: 'Nome é obrigatório' })
  name: string;

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;

  @ApiProperty({ example: ['orders', 'customers'], required: false, enum: SCREEN_PERMISSION_KEYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(SCREEN_PERMISSION_KEYS, { each: true, message: 'Permissão inválida' })
  permissions?: string[];
}
