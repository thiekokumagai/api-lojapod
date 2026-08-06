export interface FixedCost {
  id: string;
  name: string;
  value: number;
  repeats: boolean;
  type: string; // "ALWAYS" | "INSTALLMENTS"
  installmentsCount: number | null;
  createdAt: Date;
  updatedAt: Date;
}
