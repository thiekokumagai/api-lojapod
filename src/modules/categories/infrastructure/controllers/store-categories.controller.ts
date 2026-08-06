import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { ListCategoriesUseCase } from '../../domain/use-cases/list-categories.use-case';

@ApiTags('Store Categories')
@Public()
@Controller('store/categories')
export class StoreCategoriesController {
  constructor(
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorias para a loja (somente ativas)' })
  async findAll() {
    const categories = await this.listCategoriesUseCase.execute();
    return categories.filter(c => c.isVisible !== false);
  }
}
