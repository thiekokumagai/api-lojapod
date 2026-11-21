import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateOrderDto } from './create-order.dto';

// Mesmo pipe global de src/main.ts: o corpo do pedido passa pela validação real da requisição.
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const validate = (body: Record<string, any>) =>
  pipe.transform(body, { type: 'body', metatype: CreateOrderDto });

// Formato enviado por cliente-lojapod (CartSidebar + ProductCustomizerModal)
const customizedItem = (extra: Record<string, any> = {}) => ({
  productId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  productName: 'Marmita',
  quantity: 1,
  price: 40,
  isCombo: false,
  isOrderBump: false,
  isCustomized: true,
  customizationSnapshot: {
    basePrice: 25,
    totalAdditions: 15,
    finalUnitPrice: 40,
    stages: [
      {
        groupId: 'gCarne',
        groupName: 'Carne',
        options: [
          {
            optionId: 'optPicanha',
            name: 'Picanha',
            quantity: 1,
            unitPrice: 15,
            totalPrice: 15,
          },
        ],
      },
    ],
  },
  ...extra,
});

const body = (items: any[]) => ({
  customerName: 'Ana Souza',
  customerPhone: '67999990000',
  itemsTotal: 40,
  freight: 10,
  totalOrder: 50,
  totalReceived: 50,
  paymentType: 'online',
  paymentMethod: 'pix',
  deliveryModality: 'DELIVERY',
  street: 'Rua A',
  number: '1',
  neighborhood: 'Centro',
  city: 'Campo Grande',
  state: 'MS',
  cep: '79000-000',
  items,
});

describe('CreateOrderDto — validação da requisição com item montado', () => {
  it('aceita o payload do checkout com isCustomized e customizationSnapshot', async () => {
    const dto = await validate(body([customizedItem()]));
    expect(dto.items[0].isCustomized).toBe(true);
    expect(
      dto.items[0].customizationSnapshot?.stages[0].options[0],
    ).toMatchObject({
      optionId: 'optPicanha',
      quantity: 1,
    });
  });

  it('aceita item comum com isCustomized=false e sem snapshot', async () => {
    await expect(
      validate(
        body([
          customizedItem({
            isCustomized: false,
            customizationSnapshot: undefined,
          }),
        ]),
      ),
    ).resolves.toBeDefined();
  });

  it.each([
    ['quantidade negativa', { optionId: 'optPicanha', quantity: -2 }],
    ['quantidade fracionada', { optionId: 'optPicanha', quantity: 1.5 }],
    ['sem optionId', { name: 'Picanha fantasma', quantity: 1 }],
    ['campo desconhecido', { optionId: 'optPicanha', quantity: 1, hack: true }],
  ])('recusa opção com %s', async (_label, option) => {
    const item = customizedItem();
    item.customizationSnapshot.stages[0].options = [option as any];
    await expect(validate(body([item]))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('recusa snapshot sem stages', async () => {
    await expect(
      validate(
        body([customizedItem({ customizationSnapshot: { basePrice: 25 } })]),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
