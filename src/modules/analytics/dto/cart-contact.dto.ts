import { IsString, MaxLength, MinLength } from 'class-validator';

/** Contato que o cliente informou no checkout, ligado ao carrinho da sessão. */
export class CartContactDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  sessionId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @IsString()
  @MinLength(10)
  @MaxLength(30)
  phone: string;
}
