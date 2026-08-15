import * as crypto from 'crypto';
if (!globalThis.crypto) {
  Object.assign(globalThis, { crypto });
}
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { DomainExceptionsFilter } from './common/filters/domain-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const { PrismaService } = require('../prisma/prisma.service');
  const prisma = app.get(PrismaService);

  // Middleware para injetar tags do OpenGraph no Frontend
  app.use(async (req: any, res: any, next: any) => {
    // Ignorar /api e arquivos estáticos
    if (req.path.startsWith('/api') || req.path.match(/\.(js|css|ico|png|svg|json|txt|woff|woff2)$/)) {
      return next();
    }

    const fs = require('fs');
    const path = require('path');

    const hostname = req.hostname;
    const parts = hostname.split('.');
    let subdomain = parts[0];

    let title = 'Loja Online | Compre com segurança e rapidez';
    let description = 'Acesse nossa loja online e confira nossos produtos. Compra segura e entrega rápida!';
    let image = '/placeholder.svg';

    try {
      const store = await prisma.store.findUnique({
        where: { subdomain: subdomain.toLowerCase() },
        include: { storeSettings: true }
      });

      if (store) {
        title = store.title;
        description = `Os melhores produtos da loja ${store.title}. Compra segura e entrega rápida!`;
        if (store.storeSettings?.logoUrl) {
          image = store.storeSettings.logoUrl;
        }
      }
    } catch (e) {}

    const clientPath = path.join(__dirname, '..', '..', '..', 'cliente-lojapod', 'dist', 'index.html');
    const devPath = path.join(__dirname, '..', '..', '..', 'cliente-lojapod', 'index.html');
    
    let html = '';
    if (fs.existsSync(clientPath)) {
      html = fs.readFileSync(clientPath, 'utf8');
    } else if (fs.existsSync(devPath)) {
      html = fs.readFileSync(devPath, 'utf8');
    } else {
      return next();
    }

    html = html.replace(/__OG_TITLE__/g, title);
    html = html.replace(/__OG_DESC__/g, description);
    html = html.replace(/__OG_IMAGE__/g, image);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  });

  app.enableCors({
    origin: true,
    credentials: true,
    exposedHeaders: ['x-total-count'],
  });

  app.useGlobalFilters(new DomainExceptionsFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Admin API')
    .setDescription('API Ecommerce')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Digite o token JWT',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: true,
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  await app.listen(3000);
}
bootstrap();
