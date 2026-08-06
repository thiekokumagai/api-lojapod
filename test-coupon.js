const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const coupon = await prisma.coupon.findUnique({ where: { title: 'TESTEPORCENTAGEM' } });
  let discountAmount = 0;
  if (coupon.type === 'VALUE') {
    discountAmount = coupon.value || 0;
  } else if (coupon.type === 'PERCENTAGE') {
    discountAmount = (150 * (coupon.value || 0)) / 100;
  }
  
  console.log('Discount amount:', discountAmount);
}

test().catch(console.error).finally(() => prisma.$disconnect());
