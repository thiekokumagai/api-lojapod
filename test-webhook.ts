import { PrismaClient } from '@prisma/client';
import { BillingService } from './src/modules/billing/billing.service';
import { CaktoClientService } from './src/modules/billing/infrastructure/cakto-client.service';
import { ConfigService } from '@nestjs/config';

const prisma = new PrismaClient();

async function main() {
  const billing = new BillingService(prisma, new CaktoClientService(new ConfigService()));
  
  const payload = {
    "data": {
      "id": "e690c1fd-24bb-4e0e-b34a-29da66bcbdfc",
      "sck": "c08bf733-d0c1-40b9-a60c-546275d26e66",
      "fees": 2.49,
      "offer": { "id": "38qqq7m", "price": 5 },
      "amount": 5.99,
      "status": "paid",
      "customer": {
        "id": 8105147,
        "name": "WESLEY THIEKO DE AGUIAR KUMAGAI",
        "email": "demo@lojapod.com",
        "phone": "5567991122210",
      },
      "subscription": {
        "id": "fb72a0a5-8736-4ba9-bf91-2b8bd9c313b9",
        "status": "inactive",
        "paymentMethod": "pix",
        "current_period": 0,
        "next_payment_date": null,
      },
      "paymentMethod": "pix"
    },
    "event": "purchase_approved",
    "secret": "01ea9c0b-1d47-425f-adca-303ccbd06fe5"
  };

  console.log('Testando processWebhook...');
  try {
    const res = await billing.processWebhook(payload);
    console.log('Resultado:', res);
  } catch (e) {
    console.error('Erro ao processar webhook:', e);
  }
}

main().finally(() => prisma.$disconnect());
