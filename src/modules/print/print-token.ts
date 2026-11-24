import type { PrismaService } from '../../../prisma/prisma.service';

/** Token que o agente manda no handshake (auth.token; query mantida para versões antigas do app). */
export function readAgentToken(handshake: {
  auth?: Record<string, unknown>;
  query?: Record<string, unknown>;
}): string | null {
  const raw =
    handshake.auth?.token ??
    handshake.query?.token ??
    handshake.query?.print_token;
  if (typeof raw !== 'string') return null;
  const token = raw.trim();
  return token ? token : null;
}

/**
 * Loja dona do token dos agentes locais (impressora e balança usam o mesmo).
 * A comparação ignora maiúsculas porque o token é digitado à mão na ativação do app.
 */
export async function findStoreByAgentToken(
  prisma: Pick<PrismaService, 'store'>,
  token: string,
): Promise<{ id: string; title: string } | null> {
  return prisma.store.findFirst({
    where: { printToken: { equals: token, mode: 'insensitive' } },
    select: { id: true, title: true },
  });
}
