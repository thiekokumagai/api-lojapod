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
  await prisma.user.deleteMany({});
  await prisma.storeSettings.deleteMany({});
  await prisma.store.deleteMany({});

  console.log('Dados anteriores limpos com sucesso.');

  // 2. Criar Loja Demo (Tenant)
  const demoStore = await prisma.store.create({
    data: {
      subdomain: 'demo',
      title: 'Loja Pod Demo',
      adminEmail: 'admin@lojapod.com',
    },
  });
  console.log('Loja Demo criada:', demoStore.subdomain);

  // 3. Criar Super Admin e Store Admin
  const password = await bcrypt.hash('admin123', 10);

  const superAdmin = await prisma.user.create({
    data: {
      name: 'Super Admin',
      email: 'superadmin@admin.com',
      password,
      role: 'SUPER_ADMIN',
    },
  });
  console.log('Super Admin criado:', superAdmin.email);

  const storeAdmin = await prisma.user.create({
    data: {
      name: 'Admin Demo',
      email: 'admin@admin.com',
      password,
      role: 'ADMIN',
      storeId: demoStore.id,
    },
  });
  console.log('Store Admin criado:', storeAdmin.email);

  // 4. Criar Store Settings para a Loja Demo
  await prisma.storeSettings.create({
    data: {
      storeId: demoStore.id,
      storeName: demoStore.title,
      phone: '67999999999',
    },
  });
  console.log('Configurações de loja criadas.');

  // 5. Criar Categoria
  const category = await prisma.category.create({
    data: {
      storeId: demoStore.id,
      title: 'Líquidos',
      isVisible: true,
    },
  });
  console.log('Categoria padrão criada:', category.title);

  // 6. Criar Produto e Variação de teste
  const productId = '8b18985c-dd71-468e-bb9d-aebce76eb059';
  const productItemId = 'ea5ccdb0-162e-4a90-90ea-c9d4f2e54d12';

  const product = await prisma.product.create({
    data: {
      id: productId,
      storeId: demoStore.id,
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

  // 7. Criar Cupons
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
        storeId: demoStore.id,
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
  const order1 = await prisma.order.create({
    data: {
      storeId: demoStore.id,
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

  console.log('Todos os dados foram inseridos com sucesso para a loja demo!');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
