import { compareRefreshToken, hashRefreshToken } from './refresh-token-hash';

/**
 * A coluna `User.refreshToken` guarda UMA ou VÁRIAS sessões (uma por aparelho): hashes SHA-256
 * separados por vírgula. O formato legado (um hash puro) continua válido.
 *
 * Rotação: ao renovar, o token antigo vira uma entrada de carência `hash@<ms>@<hashAtual>`, aceita
 * até `<ms>` (poucos segundos). Ela cobre a resposta do /auth/refresh que se perdeu na rede e a
 * corrida entre abas. A carência NÃO é uma sessão: aponta para a sessão atual (`<hashAtual>`), e usar
 * um token em carência só SUBSTITUI a sessão atual (a anterior também entra em carência). Assim, quem
 * repete um token recém-rotacionado nunca cria uma sessão permanente a mais.
 */
export const MAX_REFRESH_SESSIONS = 10;
export const REFRESH_ROTATION_GRACE_MS = 15_000;

type Entry = {
  hash: string;
  /** Só em entradas de carência: até quando o token antigo ainda é aceito. */
  graceUntil?: number;
  /** Só em entradas de carência: hash da sessão permanente que a substituiu. */
  head?: string;
};

function parse(stored: string | null | undefined, now: number): Entry[] {
  if (!stored) return [];
  const entries: Entry[] = [];
  for (const raw of stored.split(',')) {
    const [hash, grace, head] = raw.trim().split('@');
    if (!hash) continue;
    if (grace === undefined) {
      entries.push({ hash });
      continue;
    }
    const graceUntil = Number(grace);
    // Carência vencida ou sem sessão de destino não vale mais.
    if (head && Number.isFinite(graceUntil) && graceUntil > now) {
      entries.push({ hash, graceUntil, head });
    }
  }
  // Carência órfã (a sessão de destino saiu) é descartada.
  const live = new Set(entries.filter((e) => !e.graceUntil).map((e) => e.hash));
  return entries.filter((e) => !e.graceUntil || live.has(e.head as string));
}

function serialize(entries: Entry[]): string {
  return entries
    .map((e) => (e.graceUntil ? `${e.hash}@${e.graceUntil}@${e.head}` : e.hash))
    .join(',');
}

function locate(entries: Entry[], token: string): Entry | undefined {
  return entries.find((e) => compareRefreshToken(token, e.hash));
}

/** O refresh token enviado corresponde a uma sessão válida (ou a um token ainda em carência)? */
export function matchesRefreshSession(
  stored: string | null | undefined,
  refreshToken: string,
  now = Date.now(),
): boolean {
  return !!locate(parse(stored, now), refreshToken);
}

/** Nova sessão (login): acrescenta o hash e descarta as mais antigas acima do limite. */
export function addRefreshSession(
  stored: string | null | undefined,
  newToken: string,
  now = Date.now(),
): string {
  const entries: Entry[] = [
    ...parse(stored, now),
    { hash: hashRefreshToken(newToken) },
  ];
  const permanent = entries.filter((e) => !e.graceUntil);
  const overflow = Math.max(0, permanent.length - MAX_REFRESH_SESSIONS);
  const dropped = new Set(permanent.slice(0, overflow).map((e) => e.hash));
  return serialize(
    entries.filter(
      (e) => !dropped.has(e.hash) && !(e.head && dropped.has(e.head)),
    ),
  );
}

/**
 * Rotação: a sessão do token vira o token novo; o antigo fica só em carência.
 * Retorna null se o token não corresponde a nenhuma sessão (revogado, já fora da carência).
 */
export function rotateRefreshSession(
  stored: string | null | undefined,
  oldToken: string,
  newToken: string,
  now = Date.now(),
): string | null {
  const entries = parse(stored, now);
  const used = locate(entries, oldToken);
  if (!used) return null;

  // Token em carência troca a sessão ATUAL; o permanente troca a si mesmo.
  const currentHash = used.graceUntil ? (used.head as string) : used.hash;
  const newHash = hashRefreshToken(newToken);

  const next: Entry[] = entries.map((e) => {
    if (!e.graceUntil && e.hash === currentHash) {
      return {
        hash: e.hash,
        graceUntil: now + REFRESH_ROTATION_GRACE_MS,
        head: newHash,
      };
    }
    if (e.graceUntil && e.head === currentHash) {
      return { ...e, head: newHash }; // mantém a carência, só aponta para a nova sessão
    }
    return e;
  });
  next.push({ hash: newHash });
  return serialize(next);
}

/**
 * Logout: remove SÓ a sessão do token (e as carências dela). As dos outros aparelhos ficam.
 * Retorna null se o token não corresponde a nenhuma sessão; '' se não sobrou nenhuma.
 */
export function removeRefreshSession(
  stored: string | null | undefined,
  refreshToken: string,
  now = Date.now(),
): string | null {
  const entries = parse(stored, now);
  const used = locate(entries, refreshToken);
  if (!used) return null;
  const currentHash = used.graceUntil ? (used.head as string) : used.hash;
  return serialize(
    entries.filter((e) => e.hash !== currentHash && e.head !== currentHash),
  );
}
