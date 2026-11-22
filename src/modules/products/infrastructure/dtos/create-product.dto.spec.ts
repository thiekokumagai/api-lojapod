import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const baseProduct = {
  title: 'Combo X-Burger',
  categoryId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  price: 39.9,
};

describe('CreateProductDto / UpdateProductDto — servesCount', () => {
  it('aceita servesCount inteiro entre 1 e 99 na criação', async () => {
    const dto = await pipe.transform(
      { ...baseProduct, servesCount: 2 },
      { type: 'body', metatype: CreateProductDto },
    );
    expect(dto.servesCount).toBe(2);
  });

  it('aceita servesCount null para limpar o valor na atualização', async () => {
    const dto = await pipe.transform(
      { servesCount: null },
      { type: 'body', metatype: UpdateProductDto },
    );
    expect(dto.servesCount).toBeNull();
  });

  it.each([0, -1, 100, 1.5])('recusa servesCount inválido (%s)', async (val) => {
    await expect(
      pipe.transform(
        { ...baseProduct, servesCount: val },
        { type: 'body', metatype: CreateProductDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
