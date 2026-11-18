import * as bcrypt from 'bcrypt';
import { IUsersRepository } from '../repositories/iusers.repository';
import { UpdateUserUseCase } from './update-user.use-case';

const staff = {
  id: 'u1',
  name: 'Func',
  email: 'func@loja.com',
  role: 'USER',
  permissions: [],
  storeId: 's1',
};

function setup() {
  const repo = {
    findStoreUser: jest.fn().mockResolvedValue({ ...staff }),
    findByEmail: jest.fn().mockResolvedValue(null),
    updateStoreUser: jest
      .fn()
      .mockImplementation((id: string, data: object) =>
        Promise.resolve({ ...staff, ...data }),
      ),
  };
  return {
    repo,
    useCase: new UpdateUserUseCase(repo as unknown as IUsersRepository),
  };
}

describe('UpdateUserUseCase: M3, redefinir a senha do funcionário revoga as sessões', () => {
  it('com senha nova grava refreshToken: null (derruba todas as sessões dele)', async () => {
    const { repo, useCase } = setup();

    await useCase.execute('s1', 'u1', { password: 'nova-senha-123' });

    const [, data] = repo.updateStoreUser.mock.calls[0] as [
      string,
      { password: string; refreshToken: null },
    ];
    expect(data.refreshToken).toBeNull();
    expect('refreshToken' in data).toBe(true);
    expect(await bcrypt.compare('nova-senha-123', data.password)).toBe(true);
  });

  it('sem senha (nome/permissões) NÃO mexe nas sessões', async () => {
    const { repo, useCase } = setup();

    await useCase.execute('s1', 'u1', { name: 'Novo Nome' });

    const [, data] = repo.updateStoreUser.mock.calls[0] as [string, object];
    expect('refreshToken' in data).toBe(false);
    expect('password' in data).toBe(false);
  });

  it('senha vazia é ignorada e não revoga', async () => {
    const { repo, useCase } = setup();

    await useCase.execute('s1', 'u1', { password: '', name: 'X' });

    const [, data] = repo.updateStoreUser.mock.calls[0] as [string, object];
    expect('refreshToken' in data).toBe(false);
  });
});
