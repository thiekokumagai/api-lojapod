import {
  extractPlatformSubdomain,
  getPlatformBaseDomains,
} from './platform-domains.util';
import { TenantMiddleware } from './tenant.middleware';

describe('platform-domains.util', () => {
  it('reconhece subdomínios de lojapod.com e podipedir.com.br', () => {
    expect(extractPlatformSubdomain('sopod.lojapod.com')).toEqual({
      isPlatformDomain: true,
      subdomain: 'sopod',
    });
    expect(extractPlatformSubdomain('sopod.podipedir.com.br')).toEqual({
      isPlatformDomain: true,
      subdomain: 'sopod',
    });
    expect(extractPlatformSubdomain('www.sopod.podipedir.com.br:443')).toEqual({
      isPlatformDomain: true,
      subdomain: 'sopod',
    });
  });

  it('retorna subdomain null para domínios raiz e subdomínios reservados', () => {
    expect(extractPlatformSubdomain('lojapod.com')).toEqual({
      isPlatformDomain: true,
      subdomain: null,
    });
    expect(extractPlatformSubdomain('podipedir.com.br')).toEqual({
      isPlatformDomain: true,
      subdomain: null,
    });
    expect(extractPlatformSubdomain('admin.podipedir.com.br')).toEqual({
      isPlatformDomain: true,
      subdomain: null,
    });
    expect(extractPlatformSubdomain('api.podipedir.com.br')).toEqual({
      isPlatformDomain: true,
      subdomain: null,
    });
    expect(extractPlatformSubdomain('app.lojapod.com')).toEqual({
      isPlatformDomain: true,
      subdomain: null,
    });
  });

  it('identifica domínios próprios externos como isPlatformDomain: false', () => {
    expect(extractPlatformSubdomain('hnperfumes.com.br')).toEqual({
      isPlatformDomain: false,
      subdomain: null,
    });
    expect(extractPlatformSubdomain('sopod.com.br')).toEqual({
      isPlatformDomain: false,
      subdomain: null,
    });
  });

  it('inclui domínios extras de PLATFORM_BASE_DOMAINS', () => {
    const domains = getPlatformBaseDomains('outrodominio.com.br, .teste.com');
    expect(domains).toContain('lojapod.com');
    expect(domains).toContain('podipedir.com.br');
    expect(domains).toContain('outrodominio.com.br');
    expect(domains).toContain('teste.com');
  });
});

describe('TenantMiddleware com múltiplos domínios-base', () => {
  const createMocks = () => {
    const prisma = {
      store: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      storeDomain: {
        findFirst: jest.fn(),
      },
    };
    const tenantContext = {
      run: jest.fn((_ctx, cb) => cb()),
    };
    const middleware = new TenantMiddleware(prisma as any, tenantContext as any);
    return { prisma, tenantContext, middleware };
  };

  it('resolve subdomínio em podipedir.com.br apenas por subdomain, sem consultar StoreDomain', async () => {
    const { prisma, tenantContext, middleware } = createMocks();
    prisma.store.findFirst.mockResolvedValue({
      id: 'store-1',
      subdomain: 'demo',
      isActive: true,
    });

    await middleware.use(
      {
        headers: { 'x-store-domain': 'demo.podipedir.com.br' },
        query: {},
      } as any,
      {} as any,
      jest.fn(),
    );

    expect(prisma.store.findFirst).toHaveBeenCalledWith({
      where: { subdomain: 'demo' },
    });
    expect(prisma.storeDomain.findFirst).not.toHaveBeenCalled();
    expect(tenantContext.run).toHaveBeenCalledWith(
      { storeId: 'store-1', subdomain: 'demo', isActive: true },
      expect.any(Function),
    );
  });

  it('para domínio externo (sopod.com.br), busca apenas por customDomain e StoreDomain, sem colidir com subdomain sopod', async () => {
    const { prisma, middleware } = createMocks();
    prisma.store.findFirst.mockResolvedValue(null);
    prisma.storeDomain.findFirst.mockResolvedValue(null);

    await middleware.use(
      {
        headers: { 'x-store-domain': 'sopod.com.br' },
        query: {},
      } as any,
      {} as any,
      jest.fn(),
    );

    expect(prisma.store.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { customDomain: 'sopod.com.br' },
          { customDomain: 'www.sopod.com.br' },
          { customDomain: 'sopod.com.br' },
        ],
      },
    });
  });
});
