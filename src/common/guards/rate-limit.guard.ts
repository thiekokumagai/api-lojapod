import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

export interface RateLimitOptions {
  /** Nome do limite: tentativas de rotas diferentes não se misturam. */
  name: string;
  /** Máximo de chamadas por IP dentro da janela. */
  limit: number;
  windowMs: number;
  /** Rota autenticada: além do IP, limita por usuário (não dá para trocar de IP e continuar tentando a senha). */
  perUser?: boolean;
}

const RATE_LIMIT_KEY = 'rate-limit-options';

/** Limita as chamadas por IP na rota (ou em todas as rotas do controller). */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

interface Bucket {
  count: number;
  resetAt: number;
}

/** Estado compartilhado pelo processo. Com mais de uma instância da API cada uma conta o seu. */
const buckets = new Map<string, Bucket>();

/** Só para testes. */
export function resetRateLimits() {
  buckets.clear();
}

/**
 * IP do cliente. A API roda atrás de proxy (Railway), então `req.ip` seria o do proxy e todos
 * dividiriam o mesmo limite. O proxy acrescenta o IP real ao FIM de `x-forwarded-for`; as entradas à
 * esquerda são escritas pelo cliente e podem ser falsas. `RATE_LIMIT_PROXY_HOPS` (padrão 1) diz quantos
 * proxies confiáveis existem na frente da API.
 */
export function clientIp(req: Pick<Request, 'headers' | 'ip'>): string {
  const forwarded = req.headers['x-forwarded-for'];
  const raw = Array.isArray(forwarded) ? forwarded.join(',') : forwarded;
  if (raw) {
    const hops = Math.max(1, Number(process.env.RATE_LIMIT_PROXY_HOPS) || 1);
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const ip = parts[Math.max(0, parts.length - hops)];
    if (ip) return ip;
  }
  return req.ip || 'unknown';
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!options) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { sub?: string } }>();
    const keys = [`${options.name}:${clientIp(req)}`];
    // Rotas autenticadas: também conta por usuário (roda depois do JwtAuthGuard, que preenche `req.user`)
    if (options.perUser && req.user?.sub) {
      keys.push(`${options.name}:user:${req.user.sub}`);
    }
    const now = Date.now();

    if (buckets.size > 5000) {
      for (const [k, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(k);
      }
    }

    let retryAt = 0;
    for (const key of keys) {
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + options.windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (bucket.count > options.limit)
        retryAt = Math.max(retryAt, bucket.resetAt);
    }

    if (retryAt) {
      const retryAfter = Math.max(1, Math.ceil((retryAt - now) / 1000));
      http
        .getResponse<Response>()
        .setHeader?.('Retry-After', String(retryAfter));
      throw new HttpException(
        'Muitas tentativas. Aguarde um instante e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
