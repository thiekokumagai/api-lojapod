import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PaymentsController } from '../../modules/payments/infrastructure/controllers/payments.controller';
import { PaymentsService } from '../../modules/payments/domain/services/payments.service';
import { MercadoPagoService } from '../../modules/payments/domain/services/mercadopago.service';
import { TenantContextService } from '../../modules/tenant/tenant-context.service';
import { JwtAuthGuard } from '../../modules/auth/infrastructure/guards/jwt-auth.guard';
import { DomainExceptionsFilter } from '../filters/domain-exceptions.filter';
import { resetRateLimits } from './rate-limit.guard';

// HTTP de verdade (Nest + supertest) com o serviço do Mercado Pago mockado: nada sai para a rede.
describe('limite de tentativas por HTTP (D)', () => {
  let app: INestApplication;
  const createCard = jest.fn().mockResolvedValue({
    paid: false,
    status: 'rejected',
    paymentId: '1',
    message: 'recusado',
  });

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PaymentsController],
      providers: [
        { provide: PaymentsService, useValue: {} },
        {
          provide: MercadoPagoService,
          useValue: { createCard, createPix: jest.fn() },
        },
        {
          provide: TenantContextService,
          useValue: { getStoreId: () => 'store-1' },
        },
      ],
    })
      // rota de teste da InfinitePay usa login; não faz parte deste teste
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    // Mesmo pipe e mesmo filtro do main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalFilters(new DomainExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    resetRateLimits();
    createCard.mockClear();
  });

  const validCard = {
    token: 'tok_1',
    installments: 1,
    paymentMethodId: 'visa',
  };

  it('cartão: 10 tentativas por minuto por IP; a 11ª recebe 429 e o serviço não é chamado', async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request(app.getHttpServer())
        .post('/payments/mercadopago/card/order-1')
        .set('x-forwarded-for', '203.0.113.7')
        .send(validCard);
      expect(res.status).toBe(200);
    }
    const blocked = await request(app.getHttpServer())
      .post('/payments/mercadopago/card/order-1')
      .set('x-forwarded-for', '203.0.113.7')
      .send(validCard);

    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toContain('Muitas tentativas');
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(createCard).toHaveBeenCalledTimes(10);
  });

  it('outro IP não é afetado', async () => {
    for (let i = 0; i < 11; i++) {
      await request(app.getHttpServer())
        .post('/payments/mercadopago/card/order-1')
        .set('x-forwarded-for', '203.0.113.7')
        .send(validCard);
    }
    const other = await request(app.getHttpServer())
      .post('/payments/mercadopago/card/order-1')
      .set('x-forwarded-for', '198.51.100.9')
      .send(validCard);
    expect(other.status).toBe(200);
  });

  it('o limite conta antes da validação: corpo inválido em massa também estoura', async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await request(app.getHttpServer())
        .post('/payments/mercadopago/card/order-1')
        .set('x-forwarded-for', '203.0.113.7')
        .send({});
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('número de cartão no corpo é recusado pelo DTO (400), nunca chega ao serviço', async () => {
    const res = await request(app.getHttpServer())
      .post('/payments/mercadopago/card/order-1')
      .send({
        ...validCard,
        cardNumber: '4111111111111111',
        securityCode: '123',
      });
    expect(res.status).toBe(400);
    expect(createCard).not.toHaveBeenCalled();
  });
});
