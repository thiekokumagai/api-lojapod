import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { ListProductsUseCase } from '../../domain/use-cases/list-products.use-case';
import { FindProductByIdUseCase } from '../../domain/use-cases/find-product-by-id.use-case';
import { ListProductsDto } from '../dtos/list-products.dto';

@ApiTags('Store Products')
@Public()
@Controller('store/products')
export class StoreProductsController {
  constructor(
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly findProductByIdUseCase: FindProductByIdUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar produtos para a loja (somente ativos)' })
  async findAll(@Query() query: ListProductsDto) {
    const { products, total } = await this.listProductsUseCase.execute({
      ...query,
      isVisible: true,
    });
    
    return {
      data: products.map((p) => ({
        ...p,
        imageUrl: p.images?.[0]?.url ?? null,
      })),
      total,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar produto completo para a loja' })
  async findOne(@Param('id') id: string) {
    const product = await this.findProductByIdUseCase.execute(id);
    if (!product) return null;
    return {
      ...product,
      imageUrl: product.images?.[0]?.url ?? null,
    };
  }
}
