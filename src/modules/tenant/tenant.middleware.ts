import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';
import { extractPlatformSubdomain } from './platform-domains.util';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    let rawIdentifier: string | undefined;

    // 1. Prioridade para cabeçalhos explícitos da loja (X-Store-Domain ou X-Store-Subdomain)
    const clientHeader = req.headers['x-store-domain'] || req.headers['x-store-subdomain'] || req.headers['x-custom-domain'];
    
    if (typeof clientHeader === 'string' && clientHeader.trim()) {
      rawIdentifier = clientHeader.trim().toLowerCase();
    }

    // 2. Se não houver cabeçalho explícito, verificar X-Forwarded-Host (desde que não seja a URL da Railway)
    if (!rawIdentifier) {
      const fwdHost = req.headers['x-forwarded-host'];
      if (typeof fwdHost === 'string' && fwdHost.trim()) {
        const firstHost = fwdHost.split(',')[0].trim().toLowerCase().split(':')[0];
        // Ignora domínios internos da Railway para não sobrepor o subdomínio da loja
        if (!firstHost.includes('.up.railway.app') && !firstHost.includes('railway.app')) {
          rawIdentifier = firstHost;
        }
      }
    }

    // 2. Verificar query parameter ?subdomain= ou ?domain=
    if (!rawIdentifier && typeof req.query.subdomain === 'string' && req.query.subdomain.trim()) {
      rawIdentifier = req.query.subdomain.trim().toLowerCase();
    }
    if (!rawIdentifier && typeof req.query.domain === 'string' && req.query.domain.trim()) {
      rawIdentifier = req.query.domain.trim().toLowerCase();
    }

    // 3. Extrair de hostname (ex: minhaloja.com.br, demo.lojapod.com ou localhost)
    if (!rawIdentifier && req.hostname) {
      rawIdentifier = req.hostname.toLowerCase();
    }

    // Fallback padrão se não fornecido
    if (!rawIdentifier) {
      rawIdentifier = 'demo';
    }

    let storeId: string | undefined;
    let isActive: boolean | undefined;
    let resolvedSubdomain: string | undefined;

    try {
      const cleanIdentifier = rawIdentifier.split(':')[0].replace(/^www\./, '');
      const platform = extractPlatformSubdomain(cleanIdentifier);

      let store: any = null;

      if (platform.isPlatformDomain) {
        // Domínio da plataforma (lojapod.com / podipedir.com.br): busca apenas pelo subdomínio da loja
        if (platform.subdomain) {
          store = await this.prisma.store.findFirst({
            where: { subdomain: platform.subdomain },
          });
        }
      } else if (!cleanIdentifier.includes('.')) {
        // Slug direto sem ponto (ex.: header X-Store-Subdomain: sopod ou localhost)
        store = await this.prisma.store.findFirst({
          where: { subdomain: cleanIdentifier },
        });
      } else {
        // Domínio externo de lojista (ex.: hnperfumes.com.br): busca apenas em customDomain e StoreDomain
        store = await this.prisma.store.findFirst({
          where: {
            OR: [
              { customDomain: cleanIdentifier },
              { customDomain: `www.${cleanIdentifier}` },
              { customDomain: rawIdentifier },
            ],
          },
        });

        if (!store) {
          const storeDomain = await this.prisma.storeDomain.findFirst({
            where: {
              OR: [
                { hostname: cleanIdentifier },
                { hostname: `www.${cleanIdentifier}` },
                { hostname: rawIdentifier },
              ],
            },
            include: {
              store: true,
            },
          });

          if (storeDomain?.store) {
            store = storeDomain.store;

            // Auto-sincronização apenas para domínios próprios externos
            if (!store.customDomain) {
              this.prisma.store.update({
                where: { id: store.id },
                data: { customDomain: storeDomain.hostname },
              }).catch(() => {});
            }
          }
        }
      }

      if (store) {
        storeId = store.id;
        resolvedSubdomain = store.subdomain;
        isActive = store.isActive;
      }
    } catch (error) {
      // Ignora falha de resolução inicial durante inicializações
    }

    this.tenantContextService.run({ storeId, subdomain: resolvedSubdomain || rawIdentifier, isActive }, () => {
      next();
    });
  }
}
