import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { SCREEN_PERMISSION_KEYS } from '../../../auth/permissions/screen-permissions';

export class UpdateUserDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Nome é obrigatório' })
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail({}, { message: 'Email inválido' })
  email?: string;

  @ApiProperty({ required: false, description: 'Preencha apenas para trocar a senha' })
  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password?: string;

  @ApiProperty({ required: false, enum: SCREEN_PERMISSION_KEYS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsIn(SCREEN_PERMISSION_KEYS, { each: true, message: 'Permissão inválida' })
  permissions?: string[];
}
