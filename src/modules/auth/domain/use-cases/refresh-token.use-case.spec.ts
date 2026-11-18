import {
  ConflictException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import {
  IAuthRepository,
  RotateRefreshResult,
} from '../repositories/iauth.repository';
import { REFRESH_ROTATION_GRACE_MS } from '../utils/refresh-sessions';
import { hashRefreshToken } from '../utils/refresh-token-hash';
import { LoginUseCase } from './login.use-case';
import { LogoutUseCase } from './logout.use-case';
import { RefreshTokenUseCase } from './refresh-token.use-case';

/** Repositório em memória com a mesma semântica de leitura + gravação do Prisma. */
class FakeAuthRepository implements IAuthRepository {
  refreshToken: string | null = null;
  /** Simula "outra gravação ganhou todas as tentativas do compare-and-swap". */
  forceConflict = false;
  user = {
    id: 'u1',
    name: 'Loja',
    email: 'a@a.com',
    password: bcrypt.hashSync('senha', 4),
    role: 'ADMIN' as const,
    permissions: [] as string[],
    storeId: 's1',
  };
  findByEmail() {
    return Promise.resolve({ ...this.user, refreshToken: this.refreshToken });
  }
  findById() {
    return Promise.resolve({ ...this.user, refreshToken: this.refreshToken });
  }
  updateRefreshToken(_id: string, hash: string | null) {
    this.refreshToken = hash;
    return Promise.resolve();
  }
  rotateRefreshToken(
    _id: string,
    mutate: (s: string | null) => string | null,
  ): Promise<RotateRefreshResult> {
    if (this.forceConflict) return Promise.resolve('conflict');
    const next = mutate(this.refreshToken);
    if (next === null) return Promise.resolve('rejected');
    this.refreshToken = next || null;
    return Promise.resolve('rotated');
  }
}

describe('sessão com refresh token', () => {
  let repo: FakeAuthRepository;
  let login: LoginUseCase;
  let refresh: RefreshTokenUseCase;
  let logout: LogoutUseCase;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    process.env.JWT_SECRET = 'access-secret';
    process.env.JWT_REFRESH_SECRET = 'refresh-secret';
    repo = new FakeAuthRepository();
    const jwt = new JwtService({});
    login = new LoginUseCase(repo, jwt);
    refresh = new RefreshTokenUseCase(repo, jwt);
    logout = new LogoutUseCase(repo);
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('dois aparelhos logados: a renovação de um não derruba o outro', async () => {
    const pc = await login.execute('a@a.com', 'senha');
    const celular = await login.execute('a@a.com', 'senha');

    const pc2 = await refresh.execute('u1', pc.refreshToken);
    const celular2 = await refresh.execute('u1', celular.refreshToken);

    expect(pc2.refreshToken).not.toBe(pc.refreshToken);
    await expect(
      refresh.execute('u1', pc2.refreshToken),
    ).resolves.toBeDefined();
    await expect(
      refresh.execute('u1', celular2.refreshToken),
    ).resolves.toBeDefined();
  });

  it('refresh concorrente com o mesmo token (duas abas) não derruba a sessão', async () => {
    const { refreshToken } = await login.execute('a@a.com', 'senha');

    const [a, b] = await Promise.all([
      refresh.execute('u1', refreshToken),
      refresh.execute('u1', refreshToken),
    ]);

    // as duas respostas continuam renováveis e a sessão segue única (não há sessão extra)
    await expect(refresh.execute('u1', a.refreshToken)).resolves.toBeDefined();
    await expect(refresh.execute('u1', b.refreshToken)).resolves.toBeDefined();
  });

  it('token desconhecido é recusado (403)', async () => {
    await login.execute('a@a.com', 'senha');
    await expect(refresh.execute('u1', 'lixo')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('troca de senha (refreshToken = null) revoga todas as sessões', async () => {
    const pc = await login.execute('a@a.com', 'senha');
    const celular = await login.execute('a@a.com', 'senha');
    repo.refreshToken = null;

    await expect(refresh.execute('u1', pc.refreshToken)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      refresh.execute('u1', celular.refreshToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('revogação entre a leitura e a gravação aborta a rotação (403)', async () => {
    const { refreshToken } = await login.execute('a@a.com', 'senha');
    jest
      .spyOn(repo, 'rotateRefreshToken')
      .mockImplementationOnce((_id, mutate) => {
        repo.refreshToken = null; // senha trocada nesse meio tempo
        return Promise.resolve(
          mutate(repo.refreshToken) === null ? 'rejected' : 'rotated',
        );
      });
    await expect(refresh.execute('u1', refreshToken)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('aceita o hash legado gravado antes desta mudança', async () => {
    const jwt = new JwtService({});
    const token = await jwt.signAsync(
      { sub: 'u1' },
      { secret: 'refresh-secret', expiresIn: '7d' },
    );
    repo.refreshToken = hashRefreshToken(token);
    await expect(refresh.execute('u1', token)).resolves.toBeDefined();
  });

  describe('M1: reuso do token rotacionado', () => {
    it('repetir o token na carência NÃO cria sessão permanente nova', async () => {
      const { refreshToken } = await login.execute('a@a.com', 'senha');
      await refresh.execute('u1', refreshToken);
      const before = repo.refreshToken as string;

      // o ladrão repete o token já rotacionado (dentro da carência)
      await refresh.execute('u1', refreshToken);

      const permanent = (repo.refreshToken as string)
        .split(',')
        .filter((e) => !e.includes('@'));
      expect(before.split(',').filter((e) => !e.includes('@'))).toHaveLength(1);
      expect(permanent).toHaveLength(1);
    });

    it('fora da carência: 403 e log de segurança sem o token', async () => {
      jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
      const { refreshToken } = await login.execute('a@a.com', 'senha');
      await refresh.execute('u1', refreshToken);

      jest.setSystemTime(Date.now() + REFRESH_ROTATION_GRACE_MS + 1000);

      await expect(refresh.execute('u1', refreshToken)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(warn).toHaveBeenCalledTimes(1);
      const [message] = warn.mock.calls[0] as [string];
      expect(message).toContain('userId=u1');
      expect(message).not.toContain(refreshToken);
    });
  });

  describe('M2: logout revoga só a sessão do aparelho', () => {
    it('o token do aparelho que saiu não renova mais; os outros continuam', async () => {
      const pc = await login.execute('a@a.com', 'senha');
      const celular = await login.execute('a@a.com', 'senha');

      await logout.execute('u1', pc.refreshToken);

      await expect(
        refresh.execute('u1', pc.refreshToken),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        refresh.execute('u1', celular.refreshToken),
      ).resolves.toBeDefined();
    });

    it('logout logo depois de renovar também derruba o token antigo (carência)', async () => {
      const pc = await login.execute('a@a.com', 'senha');
      const pc2 = await refresh.execute('u1', pc.refreshToken);

      await logout.execute('u1', pc2.refreshToken);

      await expect(
        refresh.execute('u1', pc.refreshToken),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        refresh.execute('u1', pc2.refreshToken),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('é idempotente: token que já não vale não dá erro', async () => {
      const pc = await login.execute('a@a.com', 'senha');
      await logout.execute('u1', pc.refreshToken);
      await expect(
        logout.execute('u1', pc.refreshToken),
      ).resolves.toBeUndefined();
      expect(repo.refreshToken).toBeNull();
    });

    it('disputa de gravação no logout: erro temporário (503), não some silencioso', async () => {
      const pc = await login.execute('a@a.com', 'senha');
      repo.forceConflict = true;
      await expect(
        logout.execute('u1', pc.refreshToken),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('B2: disputa na gravação não vira logout', () => {
    it('login: se não conseguir gravar a sessão, falha com 503 (não entrega token que não vale)', async () => {
      repo.forceConflict = true;
      await expect(login.execute('a@a.com', 'senha')).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(repo.refreshToken).toBeNull();
    });

    it('refresh: disputa devolve 409 (temporário), NÃO 403, e o token continua válido', async () => {
      const { refreshToken } = await login.execute('a@a.com', 'senha');
      repo.forceConflict = true;

      const error = await refresh
        .execute('u1', refreshToken)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ConflictException);
      expect(error).not.toBeInstanceOf(ForbiddenException);
      expect(warn).not.toHaveBeenCalled();

      repo.forceConflict = false;
      await expect(refresh.execute('u1', refreshToken)).resolves.toBeDefined();
    });

    it('refresh: 403 só quando o token realmente não bate', async () => {
      await login.execute('a@a.com', 'senha');
      await expect(refresh.execute('u1', 'lixo')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });
  });
});
