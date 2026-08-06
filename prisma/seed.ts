import { PrismaClient, OrderStatus, PaymentStatus, DiscountType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1. Limpar banco de dados
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.productItemOption.deleteMany({});
  await prisma.productItem.deleteMany({});
  await prisma.productVariation.deleteMany({});
  await prisma.variationOption.deleteMany({});
  await prisma.variation.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});

  console.log('Dados anteriores limpos com sucesso.');

  // 2. Criar Admin Default
  const password = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@admin.com' },
    update: { password },
    create: {
      name: 'Admin',
      email: 'admin@admin.com',
      password,
      role: 'ADMIN',
    },
  });
  console.log('Admin criado:', admin.email);

  // 3. Criar Categoria
  const category = await prisma.category.create({
    data: {
      title: 'Líquidos',
      isVisible: true,
    },
  });
  console.log('Categoria padrão criada:', category.title);

  // 4. Criar Produto e Variação de teste
  const productId = '8b18985c-dd71-468e-bb9d-aebce76eb059';
  const productItemId = 'ea5ccdb0-162e-4a90-90ea-c9d4f2e54d12';

  const product = await prisma.product.create({
    data: {
      id: productId,
      title: 'Nasty Passion Fruit Lemonade 35mg',
      categoryId: category.id,
      price: 70.00,
      description: 'Deliciosa limonada de maracujá da Nasty E-Liquid.',
    },
  });
  console.log('Produto de teste criado:', product.title);

  const productItem = await prisma.productItem.create({
    data: {
      id: productItemId,
      productId: productId,
      stock: 100,

      hash: '35mg',
    },
  });
  console.log('ProductItem de teste criado:', productItem.id);

  // 5. Criar Cupons
  const couponsData = [
    {
      id: '48c33471-b43a-4b26-90fc-5fea8b56f01a',
      title: 'TESTEPORCENTAGEM',
      type: DiscountType.PERCENTAGE,
      value: 10,
    },
    {
      id: 'e680f5b6-f6c4-418a-8ef1-51af558a16ba',
      title: 'TESTEVALOR',
      type: DiscountType.VALUE,
      value: 10,
    },
    {
      id: '8099979a-69de-467c-8d86-762975a45faa',
      title: 'FRETE33',
      type: DiscountType.FREE_SHIPPING,
      value: 0,
    },
  ];

  for (const c of couponsData) {
    await prisma.coupon.create({
      data: {
        id: c.id,
        title: c.title,
        status: true,
        type: c.type,
        value: c.value,
        applyToPromotionalItems: true,
      },
    });
  }
  console.log('Cupons de teste criados.');

  // === PEDIDOS SIMULADOS ===

  // 6. Pedido 1: TESTEPORCENTAGEM + Cartão de Crédito 3x (Juros 5.1%)
  const order1 = await prisma.order.create({
    data: {
      customerName: 'Cliente Simulação Porcentagem',
      customerPhone: '11999999991',
      itemsTotal: 70.00,
      freight: 15.00,
      paymentDiscount: 0,
      installmentSurcharge: 3.98,
      couponDiscount: 7.00,
      couponFreightDiscount: 0,
      receiptDiscount: 0,
      receiptSurcharge: 0,
      totalOrder: 81.98,
      totalReceived: 81.98,
      cardFee: Math.round((81.98 * 0.051) * 100) / 100,
      paymentType: 'Na Entrega',
      paymentMethod: 'Cartão de Crédito',
      installments: 3,
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.CONFIRMED,
      couponId: '48c33471-b43a-4b26-90fc-5fea8b56f01a',
      street: 'Av. Paulista',
      number: '1000',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      cep: '01310-100',
      complement: 'Apto 12',
      items: {
        create: [
          {
            productId: productId,
            productItemId: productItemId,
            productName: 'Nasty Passion Fruit Lemonade 35mg',
            price: 70.00,
            quantity: 1,
            variation: '35mg',
          },
        ],
      },
    },
  });
  console.log('Pedido 1 (Porcentagem + Crédito 3x): #', order1.orderNumber);

  // 7. Pedido 2: TESTEVALOR + Cartão de Crédito 2x (Juros 3.5%)
  const order2 = await prisma.order.create({
    data: {
      customerName: 'Cliente Simulação Valor Fixo',
      customerPhone: '11999999992',
      itemsTotal: 70.00,
      freight: 15.00,
      paymentDiscount: 0,
      installmentSurcharge: 2.63,
      couponDiscount: 10.00,
      couponFreightDiscount: 0,
      receiptDiscount: 0,
      receiptSurcharge: 0,
      totalOrder: 77.63,
      totalReceived: 77.63,
      cardFee: Math.round((77.63 * 0.035) * 100) / 100,
      paymentType: 'Na Entrega',
      paymentMethod: 'Cartão de Crédito',
      installments: 2,
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.CONFIRMED,
      couponId: 'e680f5b6-f6c4-418a-8ef1-51af558a16ba',
      street: 'Av. Brigadeiro Luís Antônio',
      number: '2000',
      neighborhood: 'Jardins',
      city: 'São Paulo',
      state: 'SP',
      cep: '01317-002',
      complement: 'Sala 4',
      items: {
        create: [
          {
            productId: productId,
            productItemId: productItemId,
            productName: 'Nasty Passion Fruit Lemonade 35mg',
            price: 70.00,
            quantity: 1,
            variation: '35mg',
          },
        ],
      },
    },
  });
  console.log('Pedido 2 (Valor Fixo + Crédito 2x): #', order2.orderNumber);

  // 8. Pedido 3: FRETE33 + Cartão de Crédito 5x (Juros 8.0%)
  const order3 = await prisma.order.create({
    data: {
      customerName: 'Cliente Simulação Frete Grátis',
      customerPhone: '11999999993',
      itemsTotal: 70.00,
      freight: 15.00,
      paymentDiscount: 0,
      installmentSurcharge: 5.60,
      couponDiscount: 0,
      couponFreightDiscount: 15.00,
      receiptDiscount: 0,
      receiptSurcharge: 0,
      totalOrder: 75.60,
      totalReceived: 75.60,
      cardFee: Math.round((75.60 * 0.08) * 100) / 100,
      paymentType: 'Na Entrega',
      paymentMethod: 'Cartão de Crédito',
      installments: 5,
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.CONFIRMED,
      couponId: '8099979a-69de-467c-8d86-762975a45faa',
      street: 'Rua Augusta',
      number: '500',
      neighborhood: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      cep: '01305-000',
      items: {
        create: [
          {
            productId: productId,
            productItemId: productItemId,
            productName: 'Nasty Passion Fruit Lemonade 35mg',
            price: 70.00,
            quantity: 1,
            variation: '35mg',
          },
        ],
      },
    },
  });
  console.log('Pedido 3 (Frete Grátis + Crédito 5x): #', order3.orderNumber);

  // 9. Pedido 4: Crédito 4x Sem Cupom (Juros 6.5%)
  // Itens: 70.00, Frete: 15.00
  // Sem Cupom
  // Base = 70.00 + 15.00 = 85.00
  // Juros = 85.00 * 6.5% = 5.53
  // Total final/recebido = 90.53
  const order4 = await prisma.order.create({
    data: {
      customerName: 'Cliente Simulação Crédito Sem Cupom',
      customerPhone: '11999999994',
      itemsTotal: 70.00,
      freight: 15.00,
      paymentDiscount: 0,
      installmentSurcharge: 5.53,
      couponDiscount: 0,
      couponFreightDiscount: 0,
      receiptDiscount: 0,
      receiptSurcharge: 0,
      totalOrder: 90.53,
      totalReceived: 90.53,
      cardFee: Math.round((90.53 * 0.065) * 100) / 100,
      paymentType: 'Na Entrega',
      paymentMethod: 'Cartão de Crédito',
      installments: 4,
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.CONFIRMED,
      street: 'Alameda Santos',
      number: '1200',
      neighborhood: 'Cerqueira César',
      city: 'São Paulo',
      state: 'SP',
      cep: '01419-001',
      items: {
        create: [
          {
            productId: productId,
            productItemId: productItemId,
            productName: 'Nasty Passion Fruit Lemonade 35mg',
            price: 70.00,
            quantity: 1,
            variation: '35mg',
          },
        ],
      },
    },
  });
  console.log('Pedido 4 (Crédito 4x Sem Cupom): #', order4.orderNumber);

  // 10. Pedido 5: PIX Sem Cupom (Desconto PIX 5%)
  // Itens: 70.00, Frete: 15.00
  // Desconto PIX = 70.00 * 5% = 3.50
  // Total final/recebido = 70.00 + 15.00 - 3.50 = 81.50
  const order5 = await prisma.order.create({
    data: {
      customerName: 'Cliente Simulação PIX Sem Cupom',
      customerPhone: '11999999995',
      itemsTotal: 70.00,
      freight: 15.00,
      paymentDiscount: 3.50,
      installmentSurcharge: 0,
      couponDiscount: 0,
      couponFreightDiscount: 0,
      receiptDiscount: 0,
      receiptSurcharge: 0,
      totalOrder: 81.50,
      totalReceived: 81.50,
      cardFee: 0,
      paymentType: 'Online',
      paymentMethod: 'PIX',
      installments: 1,
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.CONFIRMED,
      street: 'Rua Bela Cintra',
      number: '800',
      neighborhood: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      cep: '01415-000',
      items: {
        create: [
          {
            productId: productId,
            productItemId: productItemId,
            productName: 'Nasty Passion Fruit Lemonade 35mg',
            price: 70.00,
            quantity: 1,
            variation: '35mg',
          },
        ],
      },
    },
  });
  console.log('Pedido 5 (PIX Sem Cupom): #', order5.orderNumber);

  // 11. Pedido 6: PIX Com Cupom `TESTEPORCENTAGEM` (Desconto Cupom 10% + Desconto PIX 5% sobre saldo dos itens)
  // Itens: 70.00, Frete: 15.00
  // Cupom 10% = 7.00
  // Saldo dos itens = 70.00 - 7.00 = 63.00
  // Desconto PIX 5% sobre 63.00 = 3.15
  // Total final/recebido = 70.00 + 15.00 - 7.00 - 3.15 = 74.85
  const order6 = await prisma.order.create({
    data: {
      customerName: 'Cliente Simulação PIX Com Cupom',
      customerPhone: '11999999996',
      itemsTotal: 70.00,
      freight: 15.00,
      paymentDiscount: 3.15,
      installmentSurcharge: 0,
      couponDiscount: 7.00,
      couponFreightDiscount: 0,
      receiptDiscount: 0,
      receiptSurcharge: 0,
      totalOrder: 74.85,
      totalReceived: 74.85,
      cardFee: 0,
      paymentType: 'Online',
      paymentMethod: 'PIX',
      installments: 1,
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.CONFIRMED,
      couponId: '48c33471-b43a-4b26-90fc-5fea8b56f01a',
      street: 'Rua Haddock Lobo',
      number: '400',
      neighborhood: 'Cerqueira César',
      city: 'São Paulo',
      state: 'SP',
      cep: '01414-001',
      items: {
        create: [
          {
            productId: productId,
            productItemId: productItemId,
            productName: 'Nasty Passion Fruit Lemonade 35mg',
            price: 70.00,
            quantity: 1,
            variation: '35mg',
          },
        ],
      },
    },
  });
  console.log('Pedido 6 (PIX Com Cupom): #', order6.orderNumber);

  // 12. Pedido 7: Crédito 1x com juros retidos do vendedor (sem repasse ao cliente)
  // Itens: 70.00, Frete: 15.00
  // Sem Cupom
  // Base = 70.00 + 15.00 = 85.00
  // Sem Juros repassado ao cliente (installmentSurcharge = 0)
  // Total final/recebido = 85.00
  // Taxa de cartão retida do vendedor (3.0% de R$ 85.00) = R$ 2.55
  const order7 = await prisma.order.create({
    data: {
      customerName: 'Cliente Simulação Crédito 1x Sem Repasse',
      customerPhone: '11999999997',
      itemsTotal: 70.00,
      freight: 15.00,
      paymentDiscount: 0,
      installmentSurcharge: 0,
      couponDiscount: 0,
      couponFreightDiscount: 0,
      receiptDiscount: 0,
      receiptSurcharge: 0,
      totalOrder: 85.00,
      totalReceived: 85.00,
      cardFee: 2.55,
      paymentType: 'Na Entrega',
      paymentMethod: 'Cartão de Crédito',
      installments: 1,
      paymentStatus: PaymentStatus.PAID,
      status: OrderStatus.CONFIRMED,
      street: 'Rua da Consolação',
      number: '1500',
      neighborhood: 'Consolação',
      city: 'São Paulo',
      state: 'SP',
      cep: '01301-100',
      items: {
        create: [
          {
            productId: productId,
            productItemId: productItemId,
            productName: 'Nasty Passion Fruit Lemonade 35mg',
            price: 70.00,
            quantity: 1,
            variation: '35mg',
          },
        ],
      },
    },
  });
  console.log('Pedido 7 (Crédito 1x Sem Repasse ao Cliente): #', order7.orderNumber);

  console.log('Todos os dados foram inseridos com sucesso!');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
