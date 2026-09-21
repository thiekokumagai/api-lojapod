const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const prisma = new PrismaClient();

async function test() {
  const storeSettings = await prisma.storeSettings.findFirst({
    where: { vendizapAuthId: { not: null } }
  });
  if (!storeSettings) return;
  
  const client = axios.create({
    baseURL: 'https://app.vendizap.com/api',
    headers: {
      'X-Auth-Id': storeSettings.vendizapAuthId,
      'X-Auth-Secret': storeSettings.vendizapAuthSecret,
    },
  });

  try {
    const prodResponse = await client.get('/produtos/6a650fe7ce0d7b3091076149');
    console.log("=== PRODUCT BY ID ===");
    console.log(JSON.stringify(prodResponse.data, null, 2));
  } catch (err) {
    console.error(err.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
