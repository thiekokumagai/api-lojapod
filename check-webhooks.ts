import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.caktoWebhookEvent.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, event: true, createdAt: true }
  });

  console.log('Últimos 20 eventos de webhook:');
  console.table(events);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
