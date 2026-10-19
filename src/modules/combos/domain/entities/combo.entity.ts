export class ComboItemEntity {
  id: string;
  comboId: string;
  productId: string;
  productItemId?: string | null;
  quantity: number;
  variation?: string | null;

  // Carregados via include para exibição e cálculos
  productName?: string;
  productPrice?: number;
  productCostPrice?: number;
  productImage?: string | null;
  currentStock?: number;
  product?: any; // Informações completas do produto (variações, itens, imagens)
}

export class Combo {
  id: string;
  storeId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  categoryId?: string | null;
  price: number;
  isActive: boolean;
  isBestSeller: boolean;
  isFeatured: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
  maxPerOrder?: number | null;
  maxTotalSales?: number | null;
  totalSold: number;
  createdAt: Date;
  updatedAt: Date;

  items?: ComboItemEntity[];
  categoryTitle?: string | null;
  originalPrice?: number;
  discountPercentage?: number;
  stock?: number; // Calculado com base no estoque dos componentes e limites

  constructor(partial: Partial<Combo>) {
    Object.assign(this, partial);
  }
}
