import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../../../auth/infrastructure/decorators/public.decorator';
import { ListProductsUseCase } from '../../domain/use-cases/list-products.use-case';
import { FindProductByIdUseCase } from '../../domain/use-cases/find-product-by-id.use-case';
import { ListProductsDto } from '../dtos/list-products.dto';
import { PrismaService } from '../../../../../prisma/prisma.service';

@ApiTags('Store Products')
@Public()
@Controller('store/products')
export class StoreProductsController {
  constructor(
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly findProductByIdUseCase: FindProductByIdUseCase,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar produtos para a loja (somente ativos)' })
  async findAll(@Query() query: ListProductsDto) {
    const { products, total } = await this.listProductsUseCase.execute({
      ...query,
      isVisible: true,
    });

    // Mapeia vendas totais para alimentar a ordenação de Mais Vendidos
    const salesMap = new Map<string, number>();
    try {
      const sales = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        _sum: { quantity: true },
        where: {
          productId: { not: null },
          order: { status: { not: 'CANCELLED' } },
        },
      });
      for (const s of sales) {
        if (s.productId) {
          salesMap.set(s.productId, s._sum.quantity || 0);
        }
      }
    } catch {
      // Ignora erro em caso de falha de consulta de vendas
    }

    return {
      data: products.map((p) => ({
        ...p,
        totalSold: salesMap.get(p.id) || (p as any).totalSold || 0,
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
