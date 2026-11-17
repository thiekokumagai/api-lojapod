import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { UsersController } from './users.controller';
import { UpdatePasswordUseCase } from '../../domain/use-cases/update-password.use-case';
import { ListUsersUseCase } from '../../domain/use-cases/list-users.use-case';
import { CreateUserUseCase } from '../../domain/use-cases/create-user.use-case';
import { DeleteUserUseCase } from '../../domain/use-cases/delete-user.use-case';
import { UpdateUserUseCase } from '../../domain/use-cases/update-user.use-case';
import { UpdatePushTokenUseCase } from '../../domain/use-cases/update-push-token.use-case';
import { UpdateWebPushSubscriptionUseCase } from '../../domain/use-cases/update-web-push-subscription.use-case';
import { TestPushNotificationUseCase } from '../../domain/use-cases/test-push-notification.use-case';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { DomainExceptionsFilter } from '../../../../common/filters/domain-exceptions.filter';
import { resetRateLimits } from '../../../../common/guards/rate-limit.guard';
import type { IUsersRepository } from '../../domain/repositories/iusers.repository';

// HTTP de verdade (Nest + supertest), sem banco: usuários em memória e o JWT trocado por um guard de teste.
const rows: Record<
  string,
  {
    id: string;
    password: string;
    storeId: string | null;
    refreshToken: string | null;
  }
> = {};

const repo = {
  findById: jest.fn((id: string) =>
    Promise.resolve(rows[id] ? { ...rows[id] } : null),
  ),
  update: jest.fn((id: string, data: Record<string, unknown>) => {
    Object.assign(rows[id], data);
    return Promise.resolve({ ...rows[id] });
  }),
};

/** Faz o papel do JwtAuthGuard: o usuário vem do cabeçalho de teste (o do token real é o `sub`). */
const fakeJwt: CanActivate = {
  canActivate(context: ExecutionContext) {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: unknown }>();
    const sub = req.headers['x-test-user'];
    if (!sub || !rows[sub]) return false;
    req.user = { sub, storeId: rows[sub].storeId };
    return true;
  },
};

describe('PATCH /users/password por HTTP', () => {
  let app: INestApplication;
  const bcryptHash = (value: string) => bcrypt.hash(value, 4);

  beforeAll(async () => {
    const stub = { provide: undefined as never, useValue: {} };
    const providers = [
      ListUsersUseCase,
      CreateUserUseCase,
      DeleteUserUseCase,
      UpdateUserUseCase,
      UpdatePushTokenUseCase,
      UpdateWebPushSubscriptionUseCase,
      TestPushNotificationUseCase,
    ].map((token) => ({ ...stub, provide: token }));

    const module = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        ...providers,
        {
          provide: UpdatePasswordUseCase,
          useValue: new UpdatePasswordUseCase(
            repo as unknown as IUsersRepository,
          ),
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(fakeJwt)
      .compile();
    app = module.createNestApplication();
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

  beforeEach(async () => {
    resetRateLimits();
    repo.update.mockClear();
    rows.u1 = {
      id: 'u1',
      password: await bcryptHash('senha-antiga-123'),
      storeId: 'store-1',
      refreshToken: 'hash',
    };
    rows.u2 = {
      id: 'u2',
      password: await bcryptHash('outra-senha-123'),
      storeId: 'store-1',
      refreshToken: 'hash',
    };
  });

  const body = {
    currentPassword: 'senha-antiga-123',
    newPassword: 'senha-nova-456',
    confirmPassword: 'senha-nova-456',
  };
  const patch = (b: Record<string, unknown>, user = 'u1', ip = '203.0.113.7') =>
    request(app.getHttpServer())
      .patch('/users/password')
      .set('x-test-user', user)
      .set('x-forwarded-for', ip)
      .send(b);

  it('sucesso: 200, sessões derrubadas e a senha nova passa a valer', async () => {
    const res = await patch(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, sessionsRevoked: true });
    expect(rows.u1.refreshToken).toBeNull();
    expect(await bcrypt.compare('senha-nova-456', rows.u1.password)).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('senha-nova-456');
  });

  it('senha atual errada: 400; senha fraca: 400; confirmação diferente: 400; igual à atual: 400', async () => {
    expect(
      (await patch({ ...body, currentPassword: 'errada-errada' })).status,
    ).toBe(400);
    const weak = await patch({
      ...body,
      newPassword: '1234567',
      confirmPassword: '1234567',
    });
    expect(weak.status).toBe(400);
    expect(JSON.stringify(weak.body)).toContain('pelo menos 8');
    expect(
      (await patch({ ...body, confirmPassword: 'diferente-123' })).status,
    ).toBe(400);
    expect(
      (
        await patch({
          ...body,
          newPassword: body.currentPassword,
          confirmPassword: body.currentPassword,
        })
      ).status,
    ).toBe(400);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('não aceita userId no corpo: sempre troca o dono do token', async () => {
    const res = await patch({ ...body, userId: 'u2' });
    expect(res.status).toBe(400);
    expect(repo.update).not.toHaveBeenCalled();

    // sem userId, quem muda é só o u1; o u2 fica intacto
    await patch(body, 'u1');
    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(repo.update.mock.calls[0][0]).toBe('u1');
    expect(rows.u2.refreshToken).toBe('hash');
  });

  it('senha com acentos >72 bytes UTF-8 retorna 400', async () => {
    // 37 caracteres 'é' = 74 bytes UTF-8 (mas apenas 37 caracteres)
    const accented = 'é'.repeat(37);
    const res = await patch({
      ...body,
      newPassword: accented,
      confirmPassword: accented,
    });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('no máximo 72 bytes');
  });

  it('rate limit: 5 tentativas por usuário (mesmo trocando de IP); a 6ª recebe 429', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await patch(
        { ...body, currentPassword: 'errada-errada' },
        'u1',
        `198.51.100.${i + 1}`,
      );
      expect(res.status).toBe(400);
    }
    const blocked = await patch(body, 'u1', '198.51.100.99');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('rate limit por IP: outro usuário no mesmo IP também é limitado; usuário e IP novos não são afetados', async () => {
    for (let i = 0; i < 5; i++)
      await patch(
        { ...body, currentPassword: 'errada-errada' },
        'u1',
        '203.0.113.50',
      );
    expect((await patch(body, 'u2', '203.0.113.50')).status).toBe(429);
    expect(
      (
        await patch(
          { ...body, currentPassword: 'outra-senha-123' },
          'u2',
          '203.0.113.51',
        )
      ).status,
    ).toBe(200);
  });

  it('sem login: bloqueado antes de qualquer coisa', async () => {
    const res = await request(app.getHttpServer())
      .patch('/users/password')
      .send(body);
    expect(res.status).toBe(403);
    expect(repo.update).not.toHaveBeenCalled();
  });
});
