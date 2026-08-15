import { ListCategoriesUseCase } from './list-categories.use-case';
import { GetCategoryUseCase } from './get-category.use-case';
import { CreateCategoryUseCase } from './create-category.use-case';
import { UpdateCategoryUseCase } from './update-category.use-case';
import { DeleteCategoryUseCase } from './delete-category.use-case';
import { ICategoriesRepository } from '../repositories/icategories.repository';
import { Category } from '../entities/category.entity';
import { CategoryNotFoundError } from '../exceptions/category-not-found.exception';

describe('Categories Use Cases', () => {
  let listUseCase: ListCategoriesUseCase;
  let getUseCase: GetCategoryUseCase;
  let createUseCase: CreateCategoryUseCase;
  let updateUseCase: UpdateCategoryUseCase;
  let deleteUseCase: DeleteCategoryUseCase;
  let mockRepository: jest.Mocked<ICategoriesRepository>;

  const mockCategory: Category = {
    id: 'uuid-1',
    title: 'Descartáveis',
    image: null,
    isVisible: true,
    order: 1,
    deletedAt: null,
    excludeFromBestSeller: false,
  };

  beforeEach(() => {
    mockRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findLastOrder: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateOrder: jest.fn(),
      updateBatchOrder: jest.fn(),
      decrementOrdersAbove: jest.fn(),
      softDelete: jest.fn(),
    } as unknown as jest.Mocked<ICategoriesRepository>;

    listUseCase = new ListCategoriesUseCase(mockRepository);
    getUseCase = new GetCategoryUseCase(mockRepository);
    createUseCase = new CreateCategoryUseCase(mockRepository);
    updateUseCase = new UpdateCategoryUseCase(mockRepository);
    deleteUseCase = new DeleteCategoryUseCase(mockRepository);
  });

  describe('ListCategoriesUseCase', () => {
    it('should return all categories', async () => {
      mockRepository.findAll.mockResolvedValue([mockCategory]);
      const result = await listUseCase.execute();
      expect(result).toEqual([mockCategory]);
      expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('GetCategoryUseCase', () => {
    it('should return a category by id', async () => {
      mockRepository.findById.mockResolvedValue(mockCategory);
      const result = await getUseCase.execute('uuid-1');
      expect(result).toEqual(mockCategory);
      expect(mockRepository.findById).toHaveBeenCalledWith('uuid-1');
    });

    it('should throw CategoryNotFoundError if category does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(getUseCase.execute('invalid-id')).rejects.toThrow(
        CategoryNotFoundError,
      );
    });
  });

  describe('CreateCategoryUseCase', () => {
    it('should create a category with incremented order', async () => {
      mockRepository.findLastOrder.mockResolvedValue(5);
      mockRepository.create.mockResolvedValue({
        ...mockCategory,
        order: 6,
      });

      const result = await createUseCase.execute({
        title: 'Nova Categoria',
        image: 'nova.png',
        isVisible: true,
      });

      expect(result.order).toBe(6);
      expect(mockRepository.findLastOrder).toHaveBeenCalledTimes(1);
      expect(mockRepository.create).toHaveBeenCalledWith({
        title: 'Nova Categoria',
        image: 'nova.png',
        isVisible: true,
        order: 6,
      });
    });
  });

  describe('UpdateCategoryUseCase', () => {
    it('should update a category', async () => {
      mockRepository.findById.mockResolvedValue(mockCategory);
      mockRepository.update.mockResolvedValue({
        ...mockCategory,
        title: 'Descartáveis Atualizado',
      });

      const result = await updateUseCase.execute('uuid-1', {
        title: 'Descartáveis Atualizado',
      });

      expect(result.title).toBe('Descartáveis Atualizado');
      expect(mockRepository.findById).toHaveBeenCalledWith('uuid-1');
      expect(mockRepository.update).toHaveBeenCalledWith('uuid-1', {
        title: 'Descartáveis Atualizado',
      });
    });

    it('should throw CategoryNotFoundError if category to update does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(
        updateUseCase.execute('invalid-id', { title: 'New' }),
      ).rejects.toThrow(CategoryNotFoundError);
    });
  });

  describe('DeleteCategoryUseCase', () => {
    it('should soft delete and decrement orders above', async () => {
      mockRepository.findById.mockResolvedValue(mockCategory);
      mockRepository.softDelete.mockResolvedValue({
        ...mockCategory,
        deletedAt: new Date(),
      });
      mockRepository.decrementOrdersAbove.mockResolvedValue();

      const result = await deleteUseCase.execute('uuid-1');

      expect(result).toEqual({ id: 'uuid-1' });
      expect(mockRepository.findById).toHaveBeenCalledWith('uuid-1');
      expect(mockRepository.softDelete).toHaveBeenCalledWith('uuid-1');
      expect(mockRepository.decrementOrdersAbove).toHaveBeenCalledWith(
        mockCategory.order,
      );
    });

    it('should throw CategoryNotFoundError if category to delete does not exist', async () => {
      mockRepository.findById.mockResolvedValue(null);
      await expect(deleteUseCase.execute('invalid-id')).rejects.toThrow(
        CategoryNotFoundError,
      );
    });
  });
});
