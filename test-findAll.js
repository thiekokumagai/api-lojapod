const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const products = await prisma.product.findMany({
      skip: 0,
      take: 100,
      where: { deletedAt: null },
      include: {
        category: true,
        images: true,
        variations: {
          include: {
            variation: {
              include: {
                options: { orderBy: { value: 'asc' } }
              }
            }
          }
        },
        items: {
          include: {
            options: {
              include: {
                option: {
                  include: { variation: true }
                }
              }
            }
          }
        }
      }
    });
    console.log("Success! Products count:", products.length);
  } catch (err) {
    console.error("Error in Prisma findMany:", err);
  } finally {
    await prisma.$disconnect();
  }
}
main();
