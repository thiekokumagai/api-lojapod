export enum DiscountType {
  VALUE = 'VALUE',
  PERCENTAGE = 'PERCENTAGE',
  FREE_SHIPPING = 'FREE_SHIPPING',
}

export class Coupon {
  id?: string;
  title: string;
  status: boolean;
  type: DiscountType;
  value?: number | null;
  validUntilDate?: Date | null;
  startTime?: Date | null;
  endTime?: Date | null;
  maxUses?: number | null;
  currentUses: number;
  minOrderValue?: number | null;
  applyToPromotionalItems: boolean;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(props: Partial<Coupon>) {
    Object.assign(this, props);
  }
}
