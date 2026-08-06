import { Coupon } from '../entities/coupon.entity';

export interface ICouponsRepository {
  create(coupon: Coupon): Promise<Coupon>;
  update(id: string, coupon: Partial<Coupon>): Promise<Coupon>;
  findById(id: string): Promise<Coupon | null>;
  findByTitle(title: string): Promise<Coupon | null>;
  findAll(): Promise<Coupon[]>;
  delete(id: string): Promise<void>;
}
