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

    const host = (req.headers['x-forwarded-host'] || req.headers.host || req.hostname || '').toString().toLowerCase();
    const cleanHost = host.split(':')[0].replace(/^www\./, '');
    const subdomain = cleanHost.split('.')[0];

    let store: any = null;
    try {
      store = await prisma.store.findFirst({
        where: {
          OR: [
            { subdomain: subdomain },
            { customDomain: cleanHost },
            { customDomain: `www.${cleanHost}` },
          ],
        },
        include: { storeSettings: true },
      });
      if (!store) {
        store = await prisma.store.findFirst({
          include: { storeSettings: true },
        });
      }
    } catch (e) {}

    const storeName = store?.storeSettings?.storeName || store?.title || 'Loja Online';
    let title = `${storeName} | Catálogo Online`;
    let description = `Acesse o catálogo online da ${storeName} e confira nossos produtos a pronta entrega!`;
    let image = '/placeholder.svg';

    if (store?.storeSettings?.logoUrl) {
      const rawLogo = store.storeSettings.logoUrl;
      if (rawLogo.startsWith('http://') || rawLogo.startsWith('https://')) {
        image = rawLogo;
      } else {
        const minioUrl = (process.env.MINIO_PUBLIC_URL || 'https://bucket-production-10ac.up.railway.app').replace(/\/$/, '');
        const bucket = process.env.MINIO_BUCKET || 'lojapod';
        const cleanPath = rawLogo.replace(/^\//, '');
        image = `${minioUrl}/${bucket}/${cleanPath}`;
      }
    }

    // Se for rota de produto (/produto/:id)
    if (req.path.startsWith('/produto/')) {
      const productId = req.path.split('/')[2];
      if (productId) {
        try {
          const product = await prisma.product.findUnique({
            where: { id: productId },
          });
          if (product) {
            title = `${product.name} | ${storeName}`;
            if (product.description) {
              description = product.description.substring(0, 160);
            }
            if (product.imageUrl) {
              const rawImg = product.imageUrl;
              if (rawImg.startsWith('http://') || rawImg.startsWith('https://')) {
                image = rawImg;
              } else {
                const minioUrl = (process.env.MINIO_PUBLIC_URL || 'https://bucket-production-10ac.up.railway.app').replace(/\/$/, '');
                const bucket = process.env.MINIO_BUCKET || 'lojapod';
                const cleanPath = rawImg.replace(/^\//, '');
                image = `${minioUrl}/${bucket}/${cleanPath}`;
              }
            }
          }
        } catch (e) {}
      }
    }

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

    html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
    html = html.replace(/<meta\s+property=["']og:title["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:title" content="${title}" />`);
    html = html.replace(/<meta\s+name=["']twitter:title["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="twitter:title" content="${title}" />`);
    html = html.replace(/<meta\s+name=["']description["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="description" content="${description}" />`);
    html = html.replace(/<meta\s+property=["']og:description["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:description" content="${description}" />`);
    html = html.replace(/<meta\s+name=["']twitter:description["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="twitter:description" content="${description}" />`);
    html = html.replace(/<meta\s+property=["']og:image["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:image" content="${image}" />`);
    html = html.replace(/<meta\s+name=["']twitter:image["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="twitter:image" content="${image}" />`);
    html = html.replace(/<meta\s+name=["']author["']\s+content=["'].*?["']\s*\/?>/i, `<meta name="author" content="${storeName}" />`);

    if (!html.includes('og:site_name')) {
      html = html.replace(/<\/head>/i, `  <meta property="og:site_name" content="${storeName}" />\n</head>`);
    } else {
      html = html.replace(/<meta\s+property=["']og:site_name["']\s+content=["'].*?["']\s*\/?>/i, `<meta property="og:site_name" content="${storeName}" />`);
    }

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
