import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { ImportOrdersFromSheetUseCase } from './import-orders-from-sheet.use-case';

describe('ImportOrdersFromSheetUseCase', () => {
  const storeId = 'logged-store-id';
  let prisma: PrismaService;
  let useCase: ImportOrdersFromSheetUseCase;
  let customerUpsert: jest.Mock<
    Promise<{ id: string; name: string; phone: string }>,
    [Prisma.CustomerUpsertArgs]
  >;
  let orderUpsert: jest.Mock<Promise<{ id: string }>, [Prisma.OrderUpsertArgs]>;
  let orderCreate: jest.Mock<Promise<{ id: string }>, [Prisma.OrderCreateArgs]>;

  beforeEach(() => {
    customerUpsert = jest
      .fn<
        Promise<{ id: string; name: string; phone: string }>,
        [Prisma.CustomerUpsertArgs]
      >()
      .mockResolvedValue({
        id: 'customer-id',
        name: 'Roberta B',
        phone: '(66) 99933-0000',
      });
    orderUpsert = jest
      .fn<Promise<{ id: string }>, [Prisma.OrderUpsertArgs]>()
      .mockResolvedValue({ id: 'order-id' });
    orderCreate = jest
      .fn<Promise<{ id: string }>, [Prisma.OrderCreateArgs]>()
      .mockResolvedValue({ id: 'order-id' });
    prisma = {
      customer: {
        upsert: customerUpsert,
      },
      customerAddress: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'address-id' }),
      },
      order: {
        upsert: orderUpsert,
        create: orderCreate,
      },
    } as unknown as PrismaService;
    useCase = new ImportOrdersFromSheetUseCase(prisma);
  });

  it('imports .xls rows into the logged-in store using LojaPod fields and no products', async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet([
      {
        num_pedido: '26660',
        nome: 'Roberta B',
        whatsapp: '(66) 99933-0000',
        entrega: 'Entregar',
        endereco: 'Rua Dez de Maio',
        numero: '255',
        bairro: 'Parque Real',
        cidade: 'Rondonópolis',
        estado: 'MT',
        cep: '78715-659',
        referencia: 'Portão preto',
        pagamento: 'Cartão de crédito',
        troco: '0',
        observacao: 'Deixar na recepção',
        total: '149,99',
        cpf: 'ignorado',
        email: 'ignorado@example.com',
        cupom: 'IGNORADO',
        status: 'Realizado',
        data: '27/10/2026 11:56',
      },
      {
        num_pedido: '26661',
        nome: 'Ana Júlia',
        whatsapp: '(66) 99935-0000',
        endereco: 'Avenida Central',
        numero: '5055',
        bairro: 'Cidade Alta',
        cidade: 'Rondonópolis',
        estado: 'MT',
        cep: '78736-900',
        referencia: 'Casa 2',
        pagamento: 'Vale alimentação',
        observacao: '',
        total: '134,99',
        status: 'Em andamento',
        data: '27/10/2026 11:57',
      },
      {
        num_pedido: '26662',
        nome: 'Giselly',
        whatsapp: '(66) 99960-0000',
        endereco: 'Rua Antônio',
        numero: '1016',
        bairro: 'Conjunto',
        cidade: 'Rondonópolis',
        estado: 'MT',
        cep: '78700-000',
        pagamento: 'Pix',
        total: '109,90',
        status: 'Cancelado',
        data: '27/10/2026 12:40',
      },
      {
        num_pedido: '26663',
        nome: 'Claudia',
        whatsapp: '(66) 99620-0000',
        endereco: 'Avenida Central',
        numero: '851',
        bairro: 'Jardim Liberdade',
        cidade: 'Rondonópolis',
        estado: 'MT',
        cep: '78715-738',
        pagamento: 'Cartão de débito',
        total: '134,99',
        status: 'Aguardando',
        data: '27/10/2026 14:49',
      },
      {
        num_pedido: '26664',
        nome: 'Marcela',
        whatsapp: '(66) 99623-0000',
        endereco: 'Rua José',
        numero: '700',
        bairro: 'Residencial',
        cidade: 'Rondonópolis',
        estado: 'MT',
        cep: '78717-704',
        pagamento: 'Em dinheiro',
        total: '125,90',
        status: 'Realizado',
        data: '27/10/2026 15:20',
      },
    ]);
    XLSX.utils.book_append_sheet(workbook, sheet, 'Pedidos');
    const fileBuffer = XLSX.write(workbook, {
      bookType: 'xls',
      type: 'buffer',
    }) as Buffer;

    const result = await useCase.execute(fileBuffer, storeId);

    expect(result).toEqual({
      totalProcessed: 5,
      imported: 5,
      skipped: 0,
      errors: [],
    });

    const firstOrder = orderUpsert.mock.calls[0][0];
    expect(firstOrder.where.externalId).toBe(`sheet:${storeId}:26660`);
    expect(firstOrder.create).toMatchObject({
      storeId,
      customerId: 'customer-id',
      customerName: 'Roberta B',
      customerPhone: '(66) 99933-0000',
      itemsTotal: 149.99,
      totalOrder: 149.99,
      paymentType: 'Presencial',
      paymentMethod: 'credit',
      street: 'Rua Dez de Maio',
      number: '255',
      neighborhood: 'Parque Real',
      city: 'Rondonópolis',
      state: 'MT',
      cep: '78715-659',
      complement: 'Portão preto',
      observation: 'Deixar na recepção',
      status: 'COMPLETED',
      paymentStatus: 'PAID',
      createdAt: new Date(2026, 9, 27, 11, 56),
      paymentDate: new Date(2026, 9, 27, 11, 56),
    });
    expect(firstOrder.create).not.toHaveProperty('items');

    expect(
      orderUpsert.mock.calls.map(([args]) => args.create.paymentMethod),
    ).toEqual(['credit', 'food_voucher', 'pix', 'debit', 'cash']);
    expect(orderUpsert.mock.calls.map(([args]) => args.create.status)).toEqual([
      'COMPLETED',
      'PENDING',
      'PENDING',
      'PENDING',
      'COMPLETED',
    ]);
    expect(
      orderUpsert.mock.calls.every(
        ([args]) => args.create.paymentStatus === 'PAID',
      ),
    ).toBe(true);
    expect(customerUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId_phone: {
            storeId,
            phone: '(66) 99933-0000',
          },
        },
      }),
    );

    await useCase.execute(fileBuffer, storeId);

    expect(orderUpsert).toHaveBeenCalledTimes(10);
    expect(orderUpsert.mock.calls[0][0].where.externalId).toBe(
      orderUpsert.mock.calls[5][0].where.externalId,
    );
    expect(orderCreate).not.toHaveBeenCalled();
  });
});
