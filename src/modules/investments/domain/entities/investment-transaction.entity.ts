export class InvestmentTransaction {
  id: string;
  type: 'ENTRY' | 'OUTFLOW';
  amount: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(props: InvestmentTransaction) {
    Object.assign(this, props);
  }
}
