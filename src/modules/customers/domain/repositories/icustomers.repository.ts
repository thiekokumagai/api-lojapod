import { Customer } from '../entities/customer.entity';

export interface CustomerFilters {
  search?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedCustomers {
  data: Customer[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ICustomersRepository {
  findMany(filters: CustomerFilters): Promise<PaginatedCustomers>;
  findById(id: string): Promise<Customer | null>;
  update(id: string, data: Partial<Customer>): Promise<Customer>;
  create(data: { name: string; phone: string }): Promise<Customer>;
  addAddress(id: string, address: any): Promise<Customer>;
  updateAddress(customerId: string, addressId: string, data: any): Promise<Customer>;
}
