import { PrismaClient, OrderStatus, PaymentStatus, DiscountType } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpando todas as tabelas do banco de dados...');
  await prisma.orderItem.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.productItemOption.deleteMany({});
  await prisma.productItem.deleteMany({});
  await prisma.productVariation.deleteMany({});
  await prisma.variationOption.deleteMany({});
  await prisma.variation.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.cashTransaction.deleteMany({});
  await prisma.investmentTransaction.deleteMany({});
  await prisma.fixedCost.deleteMany({});
  await prisma.cashRegister.deleteMany({});
  await prisma.courier.deleteMany({});
  await prisma.storeSession.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.storeSettings.deleteMany({});
  await prisma.store.deleteMany({});

  console.log('✅ Dados anteriores limpos com sucesso.');

  const hashedPassword = await bcrypt.hash('admin123', 10);

  // 1. Criar Único Super Admin (admin@admin.com / admin123)
  const superAdmin = await prisma.user.create({
    data: {
      name: 'Super Admin',
      email: 'admin@admin.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    },
  });
  console.log('👑 Super Admin criado com sucesso:', superAdmin.email);

  // 2. Criar Loja Demo Inicial
  const demoStore = await prisma.store.create({
    data: {
      subdomain: 'demo',
      title: 'Loja Pod Demo',
      adminEmail: 'demo@lojapod.com',
      printToken: 'PRT-DEMO1234',
    },
  });
  console.log('🏪 Loja Demo criada:', demoStore.subdomain);

  // 3. Criar usuário Admin da Loja Demo
  const storeAdmin = await prisma.user.create({
    data: {
      name: 'Admin Demo',
      email: 'demo@admin.com',
      password: hashedPassword,
      role: 'ADMIN',
      storeId: demoStore.id,
    },
  });
  console.log('👤 Admin da Loja Demo criado:', storeAdmin.email);

  // 4. Criar Store Settings para a Loja Demo
  await prisma.storeSettings.create({
    data: {
      storeId: demoStore.id,
      storeName: demoStore.title,
      phone: '67999999999',
    },
  });

  // 5. Categoria Inicial
  const category = await prisma.category.create({
    data: {
      storeId: demoStore.id,
      title: 'Líquidos',
      isVisible: true,
    },
  });

  // 6. Produto Inicial
  const productId = '8b18985c-dd71-468e-bb9d-aebce76eb059';
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

  await prisma.productItem.create({
    data: {
      productId: product.id,
      stock: 100,
      hash: '35mg',
    },
  });

  console.log('🚀 Seed concluído! Super Admin ativado em admin@admin.com com a senha admin123.');
}

main()
  .catch((e) => {
    console.error('Erro no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
