export interface CashTransaction {
  id: string;
  cashRegisterId: string | null;
  type: string; // "ENTRY" | "OUTFLOW"
  amount: number;
  description: string;
  date: Date;
  fixedCostId: string | null;
  category?: string | null;
  createdAt: Date;
}
