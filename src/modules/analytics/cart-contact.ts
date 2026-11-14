/** Utilidades do contato do carrinho abandonado (nome e telefone informados no checkout). */

const MAX_ITEMS_IN_LIST = 30;

/** Telefone BR só com dígitos (DDD + 8 ou 9 dígitos); aceita +55. Devolve `null` se inválido. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let digits = raw.replace(/\D/g, '');
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith('55')
  ) {
    digits = digits.slice(2);
  }
  if (digits.length < 10 || digits.length > 11) return null;
  // DDD de 11 a 99; celular de 11 dígitos começa com 9
  if (Number(digits.slice(0, 2)) < 11) return null;
  if (digits.length === 11 && digits[2] !== '9') return null;
  return digits;
}

/** Nome sem caracteres de controle e com espaços normalizados (2 a 80 caracteres). */
export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 80) return null;
  return name;
}

/** Mesma regra da fidelidade: compara pelos 8 últimos dígitos (ignora DDI, 9 e máscara). */
export function phoneKey(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '').slice(-8);
}

export interface CartItemSummary {
  name: string;
  quantity: number;
  variation: string | null;
}

/** Itens do carrinho (JSON enviado pelo navegador) reduzidos a nome, quantidade e variação. */
export function summarizeItems(cartItems: unknown): CartItemSummary[] {
  if (!Array.isArray(cartItems)) return [];

  const summary: CartItemSummary[] = [];
  for (const raw of cartItems.slice(0, MAX_ITEMS_IN_LIST)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const product = (item.product ?? {}) as Record<string, unknown>;
    const rawName =
      typeof product.name === 'string'
        ? product.name
        : typeof item.name === 'string'
          ? item.name
          : '';
    const name = rawName.trim().slice(0, 80);
    if (!name) continue;

    const quantity = Math.min(
      99,
      Math.max(1, Math.floor(Number(item.quantity)) || 1),
    );
    const variation =
      typeof item.selectedVariation === 'string' &&
      item.selectedVariation.trim()
        ? item.selectedVariation.trim().slice(0, 60)
        : null;
    summary.push({ name, quantity, variation });
  }
  return summary;
}
