import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';

describe('API (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  const adminCredentials = {
    email: 'admin@admin.com',
    password: 'admin123',
  };

  beforeAll(async () => {
    app = await createTestApp();
  }, 60000);

  afterAll(async () => {
    await app.close();
  });

  describe('Swagger', () => {
    it('GET /api/docs deve renderizar a UI', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs')
        .expect(200);
      expect(res.text).toMatch(/swagger/i);
    });

    it('GET /api/docs-json deve expor o OpenAPI com rotas dos módulos', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/docs-json')
        .expect(200);
      const paths = Object.keys(res.body.paths ?? {});
      expect(paths).toEqual(
        expect.arrayContaining([
          '/api/auth/login',
          '/api/categories',
          '/api/users',
          '/api/variations',
          '/api/products',
        ]),
      );
      expect(res.body.components?.schemas).toBeDefined();
    });
  });

  describe('Auth', () => {
    it('POST /api/auth/login com credenciais válidas', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send(adminCredentials)
        .expect(201);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      accessToken = res.body.accessToken;
    });

    it('POST /api/auth/login com credenciais inválidas retorna 401', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: adminCredentials.email, password: 'wrong-password' })
        .expect(401);
    });
  });

  describe('Endpoints protegidos', () => {
    const auth = () => ({
      Authorization: `Bearer ${accessToken}`,
    });

    it('GET /api/categories sem token retorna 401', async () => {
      await request(app.getHttpServer()).get('/api/categories').expect(401);
    });

    it('GET /api/categories com token', async () => {
      await request(app.getHttpServer())
        .get('/api/categories')
        .set(auth())
        .expect(200);
    });

    it('GET /api/users com token', async () => {
      await request(app.getHttpServer())
        .get('/api/users')
        .set(auth())
        .expect(200);
    });

    it('GET /api/variations com token', async () => {
      await request(app.getHttpServer())
        .get('/api/variations')
        .set(auth())
        .expect(200);
    });

    it('GET /api/products com token', async () => {
      await request(app.getHttpServer())
        .get('/api/products')
        .query({ page: 1, limit: 5 })
        .set(auth())
        .expect(200);
    }, 30000);
  });
});
