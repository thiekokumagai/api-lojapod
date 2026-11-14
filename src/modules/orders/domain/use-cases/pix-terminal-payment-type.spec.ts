import { CreateOrderUseCase } from './create-order.use-case';
import { UpdateOrderUseCase } from './update-order.use-case';
import { UpdateOrderStatusUseCase } from './update-order-status.use-case';
import { RevertReceiveOrderUseCase } from './revert-receive-order.use-case';

type Fields = Record<string, unknown>;

/** Argumento `arg` da primeira chamada do mock (os mocks do jest não vêm tipados). */
const firstCallArg = (mock: jest.Mock, arg: number): Fields =>
  (mock.mock.calls as Fields[][])[0][arg];

const settingsWith = (pixOnTerminal: boolean | undefined) => ({
  get: jest.fn().mockResolvedValue({
    promoPaymentMethods: ['pix'],
    paymentGateways: pixOnTerminal === undefined ? {} : { pixOnTerminal },
  }),
});

const events = () => ({
  notifyNewOrder: jest.fn(),
  notifyOrderUpdated: jest.fn(),
  server: { emit: jest.fn() },
});

const baseOrder = (extra: Fields): Fields => ({
  id: 'o1',
  orderNumber: 7,
  storeId: 'store-1',
  status: 'PENDING',
  deliveryModality: 'DELIVERY',
  customerName: 'Cliente',
  customerPhone: '',
  itemsTotal: 50,
  freight: 0,
  totalOrder: 50,
  totalReceived: 0,
  paymentMethod: 'pix',
  paymentStatus: 'PENDING',
  paymentType: 'entrega',
  ...extra,
});

describe('Pix na maquininha: Pix não pago nunca fica online', () => {
  describe('criar pedido (CreateOrderUseCase)', () => {
    const run = async (
      pixOnTerminal: boolean | undefined,
      data: Fields,
    ): Promise<Fields> => {
      const saveWithStockDecrement = jest
        .fn()
        .mockImplementation((order: Fields) =>
          Promise.resolve({ ...order, id: 'o1' }),
        );
      const useCase = new CreateOrderUseCase(
        { saveWithStockDecrement } as never,
        {} as never,
        {} as never,
        { sendNotifications: jest.fn() } as never,
        { findAll: jest.fn().mockResolvedValue([]) } as never,
        { emitNovoPedido: jest.fn() } as never,
        events() as never,
        { getStoreId: jest.fn().mockReturnValue('store-1') } as never,
        settingsWith(pixOnTerminal) as never,
        {} as never,
        {} as never,
      );
      // O que importa é o que foi gravado; os avisos depois do save não fazem parte do teste
      await useCase.execute(data as never).catch(() => undefined);
      expect(saveWithStockDecrement).toHaveBeenCalledTimes(1);
      return firstCallArg(saveWithStockDecrement, 0);
    };

    const pix = (extra: Fields = {}) =>
      baseOrder({ paymentType: 'online', ...extra });

    it('flag ligada: Pix PENDING enviado como online é gravado como entrega', async () => {
      expect((await run(true, pix())).paymentType).toBe('entrega');
    });

    it('flag ligada: Pix PAID continua online', async () => {
      expect(
        (await run(true, pix({ paymentStatus: 'PAID' }))).paymentType,
      ).toBe('online');
    });

    it('flag ligada: cartão online e dinheiro na entrega não mudam', async () => {
      expect(
        (
          await run(
            true,
            baseOrder({ paymentMethod: 'credit', paymentType: 'online' }),
          )
        ).paymentType,
      ).toBe('online');
      expect(
        (
          await run(
            true,
            baseOrder({ paymentMethod: 'cash', paymentType: 'entrega' }),
          )
        ).paymentType,
      ).toBe('entrega');
    });

    it('sem a flag (ausente ou desligada) o Pix online continua online', async () => {
      expect((await run(undefined, pix())).paymentType).toBe('online');
      expect((await run(false, pix())).paymentType).toBe('online');
    });
  });

  describe('editar pedido (update-full)', () => {
    const run = async (
      pixOnTerminal: boolean | undefined,
      existing: Fields,
      body: Fields,
    ): Promise<Fields> => {
      const updateWithStockAdjustment = jest
        .fn()
        .mockImplementation((_id: string, order: Fields) =>
          Promise.resolve(order),
        );
      const useCase = new UpdateOrderUseCase(
        {
          findById: jest.fn().mockResolvedValue(existing),
          updateWithStockAdjustment,
        } as never,
        {} as never,
        {} as never,
        { emitNovoPedido: jest.fn() } as never,
        events() as never,
        { getStoreId: jest.fn().mockReturnValue('store-1') } as never,
        settingsWith(pixOnTerminal) as never,
      );
      await useCase.execute('o1', body as never);
      expect(updateWithStockAdjustment).toHaveBeenCalledTimes(1);
      return firstCallArg(updateWithStockAdjustment, 1);
    };

    const editBody = (extra: Fields = {}) => ({
      itemsTotal: 50,
      paymentMethod: 'pix',
      paymentType: 'online', // o admin envia online para todo Pix
      paymentStatus: 'PENDING',
      ...extra,
    });

    it('flag ligada: editar pedido Pix PENDING (entrega) não vira online', async () => {
      const saved = await run(true, baseOrder({}), editBody());
      expect(saved.paymentType).toBe('entrega');
    });

    it('flag ligada: Pix PAID continua online', async () => {
      const saved = await run(
        true,
        baseOrder({ paymentStatus: 'PAID', paymentType: 'online' }),
        editBody({ paymentStatus: 'PAID' }),
      );
      expect(saved.paymentType).toBe('online');
    });

    it('flag ligada: trocar para cartão online mantém o tipo enviado', async () => {
      const saved = await run(
        true,
        baseOrder({}),
        editBody({ paymentMethod: 'credit', paymentType: 'online' }),
      );
      expect(saved.paymentType).toBe('online');
    });

    it('sem a flag o Pix online continua online', async () => {
      expect(
        (await run(undefined, baseOrder({}), editBody())).paymentType,
      ).toBe('online');
      expect((await run(false, baseOrder({}), editBody())).paymentType).toBe(
        'online',
      );
    });
  });

  describe('voltar pagamento para PENDING (kanban)', () => {
    const run = async (
      pixOnTerminal: boolean | undefined,
      order: Fields,
    ): Promise<Fields> => {
      const save = jest
        .fn()
        .mockImplementation((o: Fields) => Promise.resolve(o));
      const useCase = new UpdateOrderStatusUseCase(
        { findById: jest.fn().mockResolvedValue(order), save } as never,
        settingsWith(pixOnTerminal) as never,
        events() as never,
        { revertOrderLoyalty: jest.fn().mockResolvedValue(undefined) } as never,
        {} as never,
      );
      await useCase.execute('o1', { paymentStatus: 'PENDING' } as never);
      expect(save).toHaveBeenCalledTimes(1);
      return firstCallArg(save, 0);
    };

    const received = () =>
      baseOrder({
        paymentStatus: 'PAID',
        paymentType: 'online',
        totalReceived: 50,
      });

    it('flag ligada: Pix recebido que volta a PENDING vira entrega', async () => {
      expect((await run(true, received())).paymentType).toBe('entrega');
    });

    it('sem a flag o tipo não muda', async () => {
      expect((await run(undefined, received())).paymentType).toBe('online');
    });

    it('flag ligada: cartão online que volta a PENDING não muda', async () => {
      expect(
        (await run(true, { ...received(), paymentMethod: 'credit' }))
          .paymentType,
      ).toBe('online');
    });
  });

  describe('desfazer recebimento (revert-receive)', () => {
    const run = async (
      pixOnTerminal: boolean | undefined,
      order: Fields,
    ): Promise<Fields> => {
      const save = jest
        .fn()
        .mockImplementation((o: Fields) => Promise.resolve(o));
      const useCase = new RevertReceiveOrderUseCase(
        { findById: jest.fn().mockResolvedValue(order), save } as never,
        events() as never,
        { revertOrderLoyalty: jest.fn().mockResolvedValue(undefined) } as never,
        settingsWith(pixOnTerminal) as never,
      );
      await useCase.execute('o1');
      expect(save).toHaveBeenCalledTimes(1);
      return firstCallArg(save, 0);
    };

    const received = () =>
      baseOrder({
        paymentStatus: 'PAID',
        paymentType: 'online',
        totalReceived: 50,
      });

    it('flag ligada: Pix desfeito vira PENDING e entrega', async () => {
      const saved = await run(true, received());
      expect(saved.paymentStatus).toBe('PENDING');
      expect(saved.paymentType).toBe('entrega');
    });

    it('sem a flag o Pix continua online', async () => {
      const saved = await run(false, received());
      expect(saved.paymentStatus).toBe('PENDING');
      expect(saved.paymentType).toBe('online');
    });
  });
});
