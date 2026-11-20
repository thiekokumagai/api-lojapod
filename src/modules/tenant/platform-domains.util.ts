export const DEFAULT_PLATFORM_BASE_DOMAINS = [
  'lojapod.com',
  'podipedir.com.br',
] as const;

export const RESERVED_PLATFORM_SUBDOMAINS = new Set([
  'app',
  'admin',
  'api',
  'www',
  'localhost',
  'superadmin',
]);

export function getPlatformBaseDomains(
  envValue = process.env.PLATFORM_BASE_DOMAINS,
): string[] {
  const domains = new Set<string>(DEFAULT_PLATFORM_BASE_DOMAINS);
  if (typeof envValue === 'string' && envValue.trim()) {
    for (const part of envValue.split(',')) {
      const cleaned = part.trim().toLowerCase().replace(/^\.+/, '');
      if (cleaned) {
        domains.add(cleaned);
      }
    }
  }
  return Array.from(domains);
}

export interface PlatformDomainResolution {
  isPlatformDomain: boolean;
  subdomain: string | null;
}

/**
 * Analisa um hostname (ex.: "sopod.podipedir.com.br", "admin.podipedir.com.br", "hnperfumes.com.br")
 * e informa se pertence a um domínio-base da plataforma e qual é o subdomínio da loja (se houver).
 */
export function extractPlatformSubdomain(
  rawHost: string,
  baseDomains: readonly string[] = getPlatformBaseDomains(),
): PlatformDomainResolution {
  const cleanHost = (rawHost || '')
    .trim()
    .toLowerCase()
    .split(':')[0]
    .replace(/^www\./, '');

  if (!cleanHost) {
    return { isPlatformDomain: false, subdomain: null };
  }

  for (const rawBase of baseDomains) {
    const baseDomain = rawBase.trim().toLowerCase().replace(/^\.+/, '');
    if (!baseDomain) continue;

    if (cleanHost === baseDomain) {
      return { isPlatformDomain: true, subdomain: null };
    }

    const suffix = `.${baseDomain}`;
    if (cleanHost.endsWith(suffix)) {
      const prefix = cleanHost.slice(0, -suffix.length);
      const firstSegment = prefix.split('.')[0];

      if (!firstSegment || RESERVED_PLATFORM_SUBDOMAINS.has(firstSegment)) {
        return { isPlatformDomain: true, subdomain: null };
      }

      return { isPlatformDomain: true, subdomain: firstSegment };
    }
  }

  return { isPlatformDomain: false, subdomain: null };
}
