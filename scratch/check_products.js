const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const prods = await prisma.product.findMany({ select: { externalId: true, title: true }});
  console.log('Total in DB:', prods.length);
  const mapped = prods.filter(p => p.externalId);
  console.log('With externalId:', mapped.length);
  if (mapped.length > 0) console.log(mapped[0]);
}
main().finally(() => prisma.$disconnect());
