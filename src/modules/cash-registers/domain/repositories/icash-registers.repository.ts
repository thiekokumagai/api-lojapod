import { CashRegister } from '../entities/cash-register.entity';

export abstract class ICashRegistersRepository {
  abstract create(data: Partial<CashRegister>): Promise<CashRegister>;
  abstract update(
    id: string,
    data: Partial<CashRegister>,
  ): Promise<CashRegister>;
  abstract findById(id: string): Promise<CashRegister | null>;
  abstract findAll(): Promise<CashRegister[]>;
  abstract delete(id: string): Promise<void>;
}
