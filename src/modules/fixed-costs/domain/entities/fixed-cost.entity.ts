export interface FixedCost {
  id: string;
  name: string;
  value: number;
  repeats: boolean;
  type: string; // "ALWAYS" | "INSTALLMENTS"
  installmentsCount: number | null;
  paidInstallments?: number;
  currentInstallment?: number;
  createdAt: Date;
  updatedAt: Date;
}
