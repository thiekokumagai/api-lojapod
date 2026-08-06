export class CashRegister {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
  initialValue?: number;

  constructor(data: Partial<CashRegister>) {
    Object.assign(this, data);
  }
}
