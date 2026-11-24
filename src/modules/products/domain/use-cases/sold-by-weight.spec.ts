import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateProductUseCase } from './create-product.use-case';
import { UpdateProductUseCase } from './update-product.use-case';
import { CreateProductDto } from '../../infrastructure/dtos/create-product.dto';

function repo(businessType: string | null) {
  return {
    checkCategoryExists: jest.fn().mockResolvedValue(true),
    findStoreBusinessType: jest.fn().mockResolvedValue(businessType),
    create: jest.fn().mockResolvedValue({ id: 'p1' }),
    update: jest.fn().mockResolvedValue({ id: 'p1' }),
    findById: jest.fn().mockResolvedValue({
      id: 'p1',
      storeId: 'store-1',
      categoryId: 'cat',
      isSoldByWeight: false,
      isCustomizable: false,
    }),
  };
}
const tenant = { getStoreId: jest.fn().mockReturnValue('store-1') };
const base = { title: 'Self-service', categoryId: 'cat', price: 69.9 };

describe('Produto vendido por peso — cadastro', () => {
  it('loja FOOD cria produto por peso com tara', async () => {
    const r = repo('FOOD');
    await new CreateProductUseCase(r as never, tenant as never).execute({
      ...base,
      isSoldByWeight: true,
      tareWeightGrams: 50,
    });
    expect(r.create).toHaveBeenCalledWith(
      expect.objectContaining({ isSoldByWeight: true, tareWeightGrams: 50 }),
    );
  });

  it('loja ACAI também pode', async () => {
    const r = repo('ACAI');
    await expect(
      new CreateProductUseCase(r as never, tenant as never).execute({
        ...base,
        isSoldByWeight: true,
      }),
    ).resolves.toBeDefined();
  });

  it('loja POD não pode vender por peso', async () => {
    const r = repo('POD');
    await expect(
      new CreateProductUseCase(r as never, tenant as never).execute({
        ...base,
        isSoldByWeight: true,
      }),
    ).rejects.toThrow(/comida ou açaí/);
    expect(r.create).not.toHaveBeenCalled();
  });

  it('produto por peso não pode ter montagem por etapas', async () => {
    const r = repo('FOOD');
    await expect(
      new CreateProductUseCase(r as never, tenant as never).execute({
        ...base,
        isSoldByWeight: true,
        isCustomizable: true,
      }),
    ).rejects.toThrow(/montagem/);
  });

  it('produto comum não consulta o tipo da loja', async () => {
    const r = repo('POD');
    await new CreateProductUseCase(r as never, tenant as never).execute(base);
    expect(r.findStoreBusinessType).not.toHaveBeenCalled();
  });

  it('update: ligar montagem num produto que já é por peso é recusado', async () => {
    const r = repo('FOOD');
    r.findById.mockResolvedValue({
      id: 'p1',
      storeId: 'store-1',
      categoryId: 'cat',
      isSoldByWeight: true,
      isCustomizable: false,
    });
    const uc = new UpdateProductUseCase(
      r as never,
      { notifyCatalogRefresh: jest.fn() } as never,
      { checkAndDeactivateAffectedCombos: jest.fn() } as never,
      tenant as never,
    );
    await expect(uc.execute('p1', { isCustomizable: true })).rejects.toThrow(
      /montagem/,
    );
    expect(r.update).not.toHaveBeenCalled();
  });

  it('update: loja POD não liga venda por peso', async () => {
    const r = repo('POD');
    const uc = new UpdateProductUseCase(
      r as never,
      { notifyCatalogRefresh: jest.fn() } as never,
      { checkAndDeactivateAffectedCombos: jest.fn() } as never,
      tenant as never,
    );
    await expect(
      uc.execute('p1', { isSoldByWeight: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('CreateProductDto — campos de peso', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const body = {
    title: 'Açaí',
    categoryId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    price: 59.9,
  };

  it('aceita isSoldByWeight e tara entre 0 e 5000 g', async () => {
    const dto = await pipe.transform(
      { ...body, isSoldByWeight: true, tareWeightGrams: 50 },
      { type: 'body', metatype: CreateProductDto },
    );
    expect(dto).toMatchObject({ isSoldByWeight: true, tareWeightGrams: 50 });
  });

  it.each([-1, 5001, 1.5])('recusa tara inválida (%s)', async (tare) => {
    await expect(
      pipe.transform(
        { ...body, tareWeightGrams: tare },
        { type: 'body', metatype: CreateProductDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
