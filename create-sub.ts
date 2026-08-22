import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const storeId = 'c08bf733-d0c1-40b9-a60c-546275d26e66';

  const store = await prisma.store.findUnique({
    where: { id: storeId }
  });

  if (!store) {
    console.error('Store não encontrada!');
    process.exit(1);
  }

  // Verificar se já tem assinatura
  const existing = await prisma.storeSubscription.findUnique({
    where: { storeId }
  });

  if (existing) {
    console.log('Loja já possui assinatura:', existing);
    process.exit(0);
  }

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  const sub = await prisma.storeSubscription.create({
    data: {
      storeId,
      status: 'TRIALING',
      trialEndsAt,
      paymentMethod: 'UNKNOWN',
      monthlyFee: 150.00
    }
  });

  console.log('Assinatura criada com sucesso:', sub);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
