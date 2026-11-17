import {
  IsNotEmpty,
  IsString,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export function MaxUtf8Bytes(
  maxBytes: number,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'maxUtf8Bytes',
      target: object.constructor,
      propertyName: propertyName,
      constraints: [maxBytes],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') return true;
          return Buffer.byteLength(value, 'utf8') <= args.constraints[0];
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} deve ter no máximo ${args.constraints[0]} bytes`;
        },
      },
    });
  };
}

/**
 * Não há `userId` aqui de propósito: a senha trocada é sempre a do usuário do token (`sub`).
 * O limite de 72 bytes UTF-8 é do bcrypt, que trunca além disso.
 */
export class UpdatePasswordDto {
  @ApiProperty({ description: 'Senha atual do usuário' })
  @IsString()
  @IsNotEmpty({ message: 'Informe a senha atual' })
  @MaxUtf8Bytes(72, { message: 'A senha atual é longa demais' })
  currentPassword: string;

  @ApiProperty({
    description: 'Nova senha (mínimo 8 caracteres, máx 72 bytes)',
  })
  @IsString()
  @MinLength(8, { message: 'A nova senha deve ter pelo menos 8 caracteres' })
  @MaxUtf8Bytes(72, {
    message: 'A nova senha deve ter no máximo 72 bytes',
  })
  newPassword: string;

  @ApiProperty({ description: 'Repetição da nova senha' })
  @IsString()
  @IsNotEmpty({ message: 'Confirme a nova senha' })
  @MaxUtf8Bytes(72, { message: 'A confirmação é longa demais' })
  confirmPassword: string;
}
