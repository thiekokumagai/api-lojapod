import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { TenantContextService } from './tenant-context.service';

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
      const cleanIdentifier = rawIdentifier.replace(/^www\./, '');
      const parts = cleanIdentifier.split('.');
      const firstPart = parts[0];

      // Se for um subdomínio lojapod.com (ex: sopod.lojapod.com), o subdomínio real no banco é 'sopod'
      const isLojapodSubdomain = cleanIdentifier.endsWith('.lojapod.com');
      const targetSubdomain = isLojapodSubdomain ? firstPart : cleanIdentifier;

      const store = await this.prisma.store.findFirst({
        where: {
          OR: [
            { customDomain: cleanIdentifier },
            { customDomain: `www.${cleanIdentifier}` },
            { customDomain: rawIdentifier },
            { subdomain: targetSubdomain },
            { subdomain: cleanIdentifier },
            { subdomain: firstPart },
          ],
        },
      });

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
