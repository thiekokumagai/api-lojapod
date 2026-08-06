import { DuplicateOptionError } from '../exceptions/duplicate-option.exception';
import { EmptyOptionsError } from '../exceptions/empty-options.exception';

export function normalizeOptionValues(values: string[]) {
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  const seen = new Set<string>();

  for (const value of normalized) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      throw new DuplicateOptionError();
    }
    seen.add(key);
  }

  if (normalized.length === 0) {
    throw new EmptyOptionsError();
  }

  return normalized;
}
