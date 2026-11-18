import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import * as bcrypt from 'bcrypt';
import { UpdatePasswordUseCase } from './update-password.use-case';
import { UpdatePasswordDto } from '../../infrastructure/dtos/update-password.dto';
import { LoginUseCase } from '../../../auth/domain/use-cases/login.use-case';
import { RefreshTokenUseCase } from '../../../auth/domain/use-cases/refresh-token.use-case';
import type { IUsersRepository } from '../repositories/iusers.repository';
import type { IAuthRepository } from '../../../auth/domain/repositories/iauth.repository';

// Sem banco: um usuário em memória que o caso de uso de senha e o de login enxergam igual.
interface Row {
  id: string;
  name: string;
  email: string;
  password: string;
  role: 'ADMIN';
  permissions: string[];
  storeId: string | null;
  refreshToken: string | null;
}

const CURRENT = 'senha-antiga-123';
const NEW = 'senha-nova-456';

async function world(storeId: string | null = 'store-1') {
  const row: Row = {
    id: 'u1',
    name: 'Ana',
    email: 'ana@loja.com',
    password: await bcrypt.hash(CURRENT, 10),
    role: 'ADMIN',
    permissions: [],
    storeId,
    refreshToken: null,
  };
  const users = {
    findById: jest.fn((id: string) =>
      Promise.resolve(id === row.id ? { ...row } : null),
    ),
    update: jest.fn((id: string, data: Partial<Row>) => {
      Object.assign(row, data);
      return Promise.resolve({ ...row });
    }),
  };
  const auth = {
    findByEmail: jest.fn((email: string) =>
      Promise.resolve(email === row.email ? { ...row } : null),
    ),
    findById: jest.fn((id: string) =>
      Promise.resolve(id === row.id ? { ...row } : null),
    ),
    updateRefreshToken: jest.fn((_id: string, hash: string | null) => {
      row.refreshToken = hash;
      return Promise.resolve();
    }),
    rotateRefreshToken: jest.fn(
      (_id: string, mutate: (s: string | null) => string | null) => {
        const next = mutate(row.refreshToken);
        if (next === null) return Promise.resolve('rejected' as const);
        row.refreshToken = next || null;
        return Promise.resolve('rotated' as const);
      },
    ),
  };
  const jwt = new JwtService();
  return {
    row,
    users,
    useCase: new UpdatePasswordUseCase(users as unknown as IUsersRepository),
    login: new LoginUseCase(auth as unknown as IAuthRepository, jwt),
    refresh: new RefreshTokenUseCase(auth as unknown as IAuthRepository, jwt),
  };
}

const dto = (extra: Partial<UpdatePasswordDto> = {}): UpdatePasswordDto => ({
  currentPassword: CURRENT,
  newPassword: NEW,
  confirmPassword: NEW,
  ...extra,
});

beforeAll(() => {
  process.env.JWT_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

describe('troca de senha do próprio usuário', () => {
  it('sucesso: a nova senha entra no login e a antiga deixa de entrar', async () => {
    const w = await world();

    const result = await w.useCase.execute('u1', dto(), 'store-1');

    expect(result).toEqual({ sessionsRevoked: true });
    await expect(w.login.execute('ana@loja.com', NEW)).resolves.toMatchObject({
      user: { email: 'ana@loja.com' },
    });
    await expect(
      w.login.execute('ana@loja.com', CURRENT),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('o hash gravado é bcrypt (mesmo algoritmo do login) e a senha em texto nunca é gravada', async () => {
    const w = await world();
    await w.useCase.execute('u1', dto(), 'store-1');

    expect(w.row.password).toMatch(/^\$2[aby]\$10\$/);
    expect(w.row.password).not.toContain(NEW);
    expect(await bcrypt.compare(NEW, w.row.password)).toBe(true);
    expect(JSON.stringify(w.users.update.mock.calls)).not.toContain(NEW);
  });

  it('senha atual errada: 400 e nada muda', async () => {
    const w = await world();
    const before = w.row.password;

    await expect(
      w.useCase.execute(
        'u1',
        dto({ currentPassword: 'errada-errada' }),
        'store-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(w.row.password).toBe(before);
    expect(w.users.update).not.toHaveBeenCalled();
    await expect(
      w.login.execute('ana@loja.com', CURRENT),
    ).resolves.toBeDefined();
  });

  it('confirmação diferente e nova igual à atual: 400', async () => {
    const w = await world();
    await expect(
      w.useCase.execute(
        'u1',
        dto({ confirmPassword: 'outra-coisa-99' }),
        'store-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      w.useCase.execute(
        'u1',
        dto({ newPassword: CURRENT, confirmPassword: CURRENT }),
        'store-1',
      ),
    ).rejects.toThrow('diferente da senha atual');
    expect(w.users.update).not.toHaveBeenCalled();
  });

  it('só troca o próprio usuário e da própria loja: outro storeId ou outro id respondem como inexistentes', async () => {
    const w = await world('store-1');
    await expect(
      w.useCase.execute('u1', dto(), 'outra-loja'),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      w.useCase.execute('u1', dto(), undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      w.useCase.execute('outro-usuario', dto(), 'store-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(w.users.update).not.toHaveBeenCalled();
  });

  it('super admin (sem loja) troca a própria senha', async () => {
    const w = await world(null);
    await expect(w.useCase.execute('u1', dto(), null)).resolves.toEqual({
      sessionsRevoked: true,
    });
    await expect(
      w.useCase.execute(
        'u1',
        dto({
          currentPassword: NEW,
          newPassword: 'mais-uma-789',
          confirmPassword: 'mais-uma-789',
        }),
        undefined,
      ),
    ).resolves.toBeDefined();
  });

  it('derruba as outras sessões: o refresh token antigo não renova mais', async () => {
    const w = await world();
    const session = await w.login.execute('ana@loja.com', CURRENT);
    // sessão aberta renovando normalmente antes da troca
    const renewed = await w.refresh.execute('u1', session.refreshToken);
    expect(renewed.accessToken).toBeTruthy();

    await w.useCase.execute('u1', dto(), 'store-1');

    expect(w.row.refreshToken).toBeNull();
    await expect(
      w.refresh.execute('u1', renewed.refreshToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      w.refresh.execute('u1', session.refreshToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    // quem entra de novo com a senha nova volta a ter sessão
    const again = await w.login.execute('ana@loja.com', NEW);
    await expect(
      w.refresh.execute('u1', again.refreshToken),
    ).resolves.toBeDefined();

    // Refresh roubado antigo NÃO volta a valer após novo login
    await expect(
      w.refresh.execute('u1', session.refreshToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      w.refresh.execute('u1', renewed.refreshToken),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nenhuma mensagem de erro carrega senha', async () => {
    const w = await world();
    const errors = await Promise.all([
      w.useCase
        .execute(
          'u1',
          dto({ currentPassword: 'segredo-que-nao-pode-vazar' }),
          'store-1',
        )
        .catch((e: Error) => e.message),
      w.useCase
        .execute(
          'u1',
          dto({ confirmPassword: 'confirmacao-secreta-1' }),
          'store-1',
        )
        .catch((e: Error) => e.message),
    ]);
    for (const message of errors) {
      expect(message).not.toContain('segredo-que-nao-pode-vazar');
      expect(message).not.toContain('confirmacao-secreta-1');
      expect(message).not.toContain(NEW);
    }
  });
});

describe('validação do DTO', () => {
  const check = async (body: Record<string, unknown>) => {
    const errors = await validate(plainToInstance(UpdatePasswordDto, body));
    return errors.flatMap((e) => Object.values(e.constraints ?? {}));
  };

  it('aceita senha de 8 a 72 caracteres', async () => {
    expect(
      await check({
        currentPassword: 'x',
        newPassword: '12345678',
        confirmPassword: '12345678',
      }),
    ).toEqual([]);
    expect(
      await check({
        currentPassword: 'x',
        newPassword: 'a'.repeat(72),
        confirmPassword: 'a'.repeat(72),
      }),
    ).toEqual([]);
  });

  it('senha fraca (menos de 8) é recusada', async () => {
    const messages = await check({
      currentPassword: 'x',
      newPassword: '1234567',
      confirmPassword: '1234567',
    });
    expect(messages).toContain('A nova senha deve ter pelo menos 8 caracteres');
  });

  it('senha acima de 72 (limite do bcrypt), campos vazios ou ausentes são recusados', async () => {
    expect(
      (
        await check({
          currentPassword: 'x',
          newPassword: 'a'.repeat(73),
          confirmPassword: 'a'.repeat(73),
        })
      ).join(),
    ).toContain('no máximo 72');

    // Senha com acentos >72 bytes UTF-8 é recusada no DTO mesmo com menos de 72 caracteres
    const accented = 'é'.repeat(37); // 37 caracteres = 74 bytes UTF-8
    expect(
      (
        await check({
          currentPassword: 'x',
          newPassword: accented,
          confirmPassword: accented,
        })
      ).join(),
    ).toContain('no máximo 72 bytes');

    expect(
      (
        await check({
          currentPassword: '',
          newPassword: '12345678',
          confirmPassword: '',
        })
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      (await check({ currentPassword: 'x', newPassword: '12345678' })).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('senha com acentos >72 bytes UTF-8 lança BadRequestException no use case', async () => {
    const w = await world();
    const accented = 'é'.repeat(37);
    await expect(
      w.useCase.execute(
        'u1',
        dto({ newPassword: accented, confirmPassword: accented }),
        'store-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
