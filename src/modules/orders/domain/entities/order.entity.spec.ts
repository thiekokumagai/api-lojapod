import {
  CANNOT_CANCEL_COMPLETED_ORDER_MESSAGE,
  Order,
  OrderStatus,
} from './order.entity';

describe('Order.cancel', () => {
  it('recusa cancelar pedido entregue com mensagem em português', () => {
    const order = new Order({ status: OrderStatus.COMPLETED });

    expect(() => order.cancel()).toThrow(CANNOT_CANCEL_COMPLETED_ORDER_MESSAGE);
    expect(CANNOT_CANCEL_COMPLETED_ORDER_MESSAGE).toBe(
      'Este pedido já foi entregue e não pode ser cancelado.',
    );
    expect(order.status).toBe(OrderStatus.COMPLETED);
  });

  it('cancela pedido ainda não entregue', () => {
    const order = new Order({ status: OrderStatus.DISPATCHED });

    order.cancel();

    expect(order.status).toBe(OrderStatus.CANCELLED);
  });
});
