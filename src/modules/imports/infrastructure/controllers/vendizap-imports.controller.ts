import {
  Controller,
  Post,
  Delete,
  Res,
  HttpStatus,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { CurrentUser } from '../../../auth/infrastructure/decorators/current-user.decorator';
import type { JwtPayload } from '../../../auth/infrastructure/types/jwt-payload.type';
import { ImportCategoriesUseCase } from '../../domain/use-cases/import-categories.use-case';
import { ImportProductsUseCase } from '../../domain/use-cases/import-products.use-case';
import { ImportProductImagesUseCase } from '../../domain/use-cases/import-product-images.use-case';
import { ImportProductVariationsUseCase } from '../../domain/use-cases/import-product-variations.use-case';
import { ImportOrdersUseCase } from '../../domain/use-cases/import-orders.use-case';
import { ImportOrdersFromSheetUseCase } from '../../domain/use-cases/import-orders-from-sheet.use-case';
import { ClearDatabaseUseCase } from '../../domain/use-cases/clear-database.use-case';
import { FixProductCategoriesUseCase } from '../../domain/use-cases/fix-product-categories.use-case';

@ApiTags('Imports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('imports')
export class VendizapImportsController {
  constructor(
    private readonly importCategoriesUseCase: ImportCategoriesUseCase,
    private readonly importProductsUseCase: ImportProductsUseCase,
    private readonly importProductImagesUseCase: ImportProductImagesUseCase,
    private readonly importProductVariationsUseCase: ImportProductVariationsUseCase,
    private readonly importOrdersUseCase: ImportOrdersUseCase,
    private readonly importOrdersFromSheetUseCase: ImportOrdersFromSheetUseCase,
    private readonly clearDatabaseUseCase: ClearDatabaseUseCase,
    private readonly fixProductCategoriesUseCase: FixProductCategoriesUseCase,
  ) {}

  @Post('vendizap/categories')
  async importCategories(@Res() res: Response, @CurrentUser() user: JwtPayload) {
    if (!user.storeId) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'StoreId is required' });
    try {
      await this.importCategoriesUseCase.execute(user.storeId);
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Categorias importadas com sucesso' });
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: error.message });
    }
  }

  @Post('vendizap/products')
  async importProducts(@Res() res: Response, @CurrentUser() user: JwtPayload) {
    if (!user.storeId) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'StoreId is required' });
    try {
      await this.importProductsUseCase.execute(user.storeId);
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Produtos importados com sucesso' });
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: error.message });
    }
  }

  @Post('vendizap/products/fix-categories')
  async fixProductCategories(@Res() res: Response, @CurrentUser() user: JwtPayload) {
    if (!user.storeId) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'StoreId is required' });
    try {
      const result = await this.fixProductCategoriesUseCase.execute(user.storeId);
      return res
        .status(HttpStatus.OK)
        .json({ 
          message: 'Categorias de produtos corrigidas com sucesso',
          data: result
        });
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: error.message });
    }
  }

  @Post('vendizap/products/images')
  async importProductImages(@Res() res: Response, @CurrentUser() user: JwtPayload) {
    if (!user.storeId) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'StoreId is required' });
    try {
      await this.importProductImagesUseCase.execute(user.storeId);
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Imagens de produtos importadas com sucesso' });
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: error.message });
    }
  }

  @Post('vendizap/products/variations')
  async importProductVariations(@Res() res: Response, @CurrentUser() user: JwtPayload) {
    if (!user.storeId) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'StoreId is required' });
    try {
      await this.importProductVariationsUseCase.execute(user.storeId);
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Variações de produtos importadas com sucesso' });
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: error.message });
    }
  }

  @Post('vendizap/orders')
  async importOrders(@Res() res: Response, @CurrentUser() user: JwtPayload) {
    if (!user.storeId) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'StoreId is required' });
    try {
      await this.importOrdersUseCase.execute(user.storeId);
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Pedidos importados com sucesso' });
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: error.message });
    }
  }

  @Post('orders/sheet')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async importOrdersSheet(
    @UploadedFile() file: Express.Multer.File,
    @Res() res: Response,
    @CurrentUser() user: JwtPayload,
  ) {
    if (!user.storeId) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'StoreId is required' });
    }
    if (!file || !file.buffer) {
      return res.status(HttpStatus.BAD_REQUEST).json({ error: 'Arquivo (.xlsx ou .csv) não fornecido' });
    }

    try {
      const result = await this.importOrdersFromSheetUseCase.execute(file.buffer, user.storeId);
      return res.status(HttpStatus.OK).json({
        message: 'Planilha de pedidos importada com sucesso',
        ...result,
      });
    } catch (error: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        error: error.message || 'Erro ao importar planilha de pedidos',
      });
    }
  }

  @Delete('vendizap/clear')
  async clearDatabase(@Res() res: Response, @CurrentUser() user: JwtPayload) {
    if (!user.storeId) return res.status(HttpStatus.BAD_REQUEST).json({ error: 'StoreId is required' });
    try {
      await this.clearDatabaseUseCase.execute(user.storeId);
      return res
        .status(HttpStatus.OK)
        .json({ message: 'Banco de dados limpo com sucesso' });
    } catch (error) {
      return res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ error: error.message });
    }
  }
}
