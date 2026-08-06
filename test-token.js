const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("Usuários e Tokens:");
  users.forEach(u => console.log(`- ${u.email}: ${u.expoPushToken || 'NENHUM TOKEN'}`));
}

main().catch(console.error).finally(() => prisma.$disconnect());
