/**
 * Montagem dos endereços enviados ao Google para medir a distância do frete. É a mesma montagem do navegador
 * (`cliente-lojapod/src/utils/freight-address.ts` para o destino e `use-calculator-freight.tsx` para a origem),
 * usando os campos que o pedido guarda (rua, número, bairro, cidade, UF). Mesma tabela de casos nos dois testes.
 */

export interface FreightOriginSettings {
  street?: string | null;
  number?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
  deliveryOriginCep?: string | null;
  deliveryOriginNumber?: string | null;
}

/** Origem: o local ativo da loja (os campos principais das configurações, que o admin atualiza ao ativar um local). */
export function buildFreightOrigin(settings: FreightOriginSettings): string {
  const street = (settings.street || '').trim();
  const num = (settings.deliveryOriginNumber || settings.number || '').trim();
  const city = (settings.city || '').trim();
  const state = (settings.state || '').trim();
  const cep = (
    settings.deliveryOriginCep ||
    settings.cep ||
    '79000-000'
  ).replace(/\D/g, '');

  return street
    ? `${street}${num ? `, ${num}` : ''}${city ? `, ${city}` : ''}${state ? ` - ${state}` : ''}, CEP ${cep}, Brasil`
    : num
      ? `CEP ${cep}, ${num}, Brasil`
      : `CEP ${cep}, Brasil`;
}

export interface FreightDestinationInput {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
}

function isValidNumber(num: string): boolean {
  if (!num) return false;
  const clean = num.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    clean !== '' && clean !== 'sn' && clean !== '0' && clean !== 'semnumero'
  );
}

function cleanStreetName(street: string): string {
  return street.replace(/,?\s*(?:s\/n|sn|sem\s*n[úu]mero)\.?$/i, '').trim();
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanAddressString(addrStr: string): string {
  if (!addrStr) return '';
  let cleaned = addrStr.replace(
    /(?:,\s*|\s+)(?:s\/n|sn|sem\s*n[úu]mero)\.?(?=,|$)/gi,
    '',
  );
  cleaned = cleaned.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/,\s*$/, '');
  return cleaned;
}

/** Destino: rua + número (sem duplicar), bairro, cidade, UF. Vazio se faltar a rua. */
export function buildFreightDestination(
  input: FreightDestinationInput,
): string {
  const rawStreet = (input.street || '').trim();
  if (!rawStreet) return '';

  const rawNum = (input.number || '').trim();
  let street = cleanStreetName(rawStreet);
  if (isValidNumber(rawNum)) {
    const numAtEndRegex = new RegExp(
      `(?:,\\s*|\\s+)(?:n[ºo]?\\s*)?${escapeRegExp(rawNum)}$`,
      'i',
    );
    if (!numAtEndRegex.test(street)) street = `${street}, ${rawNum}`;
  }

  const parts = [
    street,
    (input.neighborhood || '').trim(),
    (input.city || '').trim(),
    (input.state || '').trim(),
  ].filter(Boolean);
  return cleanAddressString(parts.join(', '));
}
