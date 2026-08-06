import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';

export interface OrderFilters {
  search?: string;
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedOrders {
  data: Order[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export abstract class IOrdersRepository {
  abstract findMany(filters: OrderFilters): Promise<PaginatedOrders>;
  abstract findById(id: string): Promise<Order | null>;
  abstract findPaidOrdersByPaymentDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Order[]>;
  abstract updateStatus(id: string, status: OrderStatus): Promise<void>;
  abstract save(order: Order): Promise<Order>;
  abstract saveWithStockDecrement(order: Order): Promise<Order>;
  abstract updateWithStockAdjustment(id: string, order: Order): Promise<Order>;
  abstract cancelAndRestoreStock(id: string): Promise<Order>;
  abstract recoverAndDecrementStock(id: string, newStatus: OrderStatus): Promise<Order>;
}
