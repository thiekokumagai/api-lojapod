import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MinioService } from '../../../../minio/minio.service';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { UploadedFile as UploadedFileType } from '../../../../common/types/uploaded-file.type';

import { CreateProductDto } from '../dtos/create-product.dto';
import { ListProductsDto } from '../dtos/list-products.dto';
import { ProductResponseDto } from '../dtos/product-response.dto';
import { AttachProductVariationsDto } from '../dtos/attach-product-variations.dto';
import { CreateProductItemsDto } from '../dtos/create-product-items.dto';
import { UpdateProductItemStockDto } from '../dtos/update-product-item-stock.dto';
import { UploadProductImagesDto } from '../dtos/upload-product-images.dto';
import { UpdateProductDto } from '../dtos/update-product.dto';

import { ListProductsUseCase } from '../../domain/use-cases/list-products.use-case';
import { FindProductByIdUseCase } from '../../domain/use-cases/find-product-by-id.use-case';
import { CreateProductUseCase } from '../../domain/use-cases/create-product.use-case';
import { UpdateProductUseCase } from '../../domain/use-cases/update-product.use-case';
import { AttachProductVariationsUseCase } from '../../domain/use-cases/attach-product-variations.use-case';
import { CreateProductItemsUseCase } from '../../domain/use-cases/create-product-items.use-case';
import { ListProductItemsUseCase } from '../../domain/use-cases/list-product-items.use-case';
import { UpdateProductItemStockUseCase } from '../../domain/use-cases/update-product-item-stock.use-case';
import { GetStockHistoryUseCase } from '../../domain/use-cases/get-stock-history.use-case';
import { ManageProductImagesUseCase } from '../../domain/use-cases/manage-product-images.use-case';
import { DeleteProductUseCase } from '../../domain/use-cases/delete-product.use-case';
import { DeleteProductVariationUseCase } from '../../domain/use-cases/delete-product-variation.use-case';
import { DeleteProductVariationOptionUseCase } from '../../domain/use-cases/delete-product-variation-option.use-case';
import { DuplicateProductUseCase } from '../../domain/use-cases/duplicate-product.use-case';


@ApiTags('Products')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly findProductByIdUseCase: FindProductByIdUseCase,
    private readonly createProductUseCase: CreateProductUseCase,
    private readonly updateProductUseCase: UpdateProductUseCase,
    private readonly attachProductVariationsUseCase: AttachProductVariationsUseCase,
    private readonly createProductItemsUseCase: CreateProductItemsUseCase,
    private readonly listProductItemsUseCase: ListProductItemsUseCase,
    private readonly updateProductItemStockUseCase: UpdateProductItemStockUseCase,
    private readonly getStockHistoryUseCase: GetStockHistoryUseCase,
    private readonly manageProductImagesUseCase: ManageProductImagesUseCase,
    private readonly deleteProductUseCase: DeleteProductUseCase,
    private readonly deleteProductVariationUseCase: DeleteProductVariationUseCase,
    private readonly deleteProductVariationOptionUseCase: DeleteProductVariationOptionUseCase,
    private readonly duplicateProductUseCase: DuplicateProductUseCase,
    private readonly minioService: MinioService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar produtos' })
  @ApiResponse({
    status: 200,
    description: 'Lista de produtos',
    type: [ProductResponseDto],
  })
  async findAll(@Query() query: ListProductsDto, @Res({ passthrough: true }) res: any) {
    const { products, total } = await this.listProductsUseCase.execute(query);
    
    // Send total in headers so we don't break existing payload structure
    res.header('x-total-count', total.toString());
    
    return products.map((p) => ({
      ...p,
      imageUrl: p.images?.[0]?.url ?? null,
    }));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar produto completo' })
  @ApiResponse({
    status: 200,
    description: 'Produto com categoria, imagens, variações e itens',
    type: ProductResponseDto,
  })
  async findOne(@Param('id') id: string) {
    const product = await this.findProductByIdUseCase.execute(id);
    if (!product) return null;
    return {
      ...product,
      imageUrl: product.images?.[0]?.url ?? null,
    };
  }

  @Post()
  @ApiOperation({ summary: 'Criar produto' })
  @ApiResponse({
    status: 201,
    description: 'Produto criado com sucesso',
    type: ProductResponseDto,
  })
  create(@Body() dto: CreateProductDto) {
    return this.createProductUseCase.execute(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar produto' })
  @ApiResponse({
    status: 200,
    description: 'Produto atualizado com sucesso',
    type: ProductResponseDto,
  })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.updateProductUseCase.execute(id, dto);
  }

  @Post(':id/variations')
  @ApiOperation({ summary: 'Vincular variações ao produto' })
  attachVariations(
    @Param('id') id: string,
    @Body() dto: AttachProductVariationsDto,
  ) {
    return this.attachProductVariationsUseCase.execute(id, dto);
  }

  @Post(':id/items')
  @ApiOperation({ summary: 'Criar itens do produto' })
  createItems(@Param('id') id: string, @Body() dto: CreateProductItemsDto) {
    return this.createProductItemsUseCase.execute(id, dto);
  }

  @Get(':id/items')
  @ApiOperation({ summary: 'Listar itens do produto' })
  listItems(@Param('id') id: string) {
    return this.listProductItemsUseCase.execute(id);
  }

  @Patch('items/:itemId')
  @ApiOperation({ summary: 'Atualizar estoque do item do produto' })
  updateItemStock(
    @Param('itemId') itemId: string,
    @Body() dto: UpdateProductItemStockDto,
  ) {
    return this.updateProductItemStockUseCase.execute(itemId, dto);
  }

  @Get(':id/stock-history')
  @ApiOperation({ summary: 'Obter histórico de movimentações de estoque' })
  getStockHistory(@Param('id') id: string) {
    return this.getStockHistoryUseCase.execute(id);
  }

  @Post(':id/images')
  @UseInterceptors(FilesInterceptor('files'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadProductImagesDto })
  @ApiOperation({ summary: 'Fazer upload de imagens do produto' })
  async uploadImages(
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      return this.findProductByIdUseCase.execute(id);
    }

    const urls: string[] = [];

    for (const file of files) {
      const uuid = randomUUID();

      const mainBuffer = await sharp(file.buffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toBuffer();

      const mainUpload = await this.minioService.uploadFile(
        {
          ...file,
          customName: `${uuid}.webp`,
          buffer: mainBuffer,
          mimetype: 'image/webp',
        } as UploadedFileType,
        'products',
      );

      const thumbBuffer = await sharp(file.buffer)
        .resize(450, 450, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toBuffer();

      await this.minioService.uploadFile(
        {
          ...file,
          customName: `${uuid}-thumb.webp`,
          buffer: thumbBuffer,
          mimetype: 'image/webp',
        } as UploadedFileType,
        'products',
      );

      urls.push(mainUpload.fileName);
    }

    return this.manageProductImagesUseCase.addImages(id, urls);
  }

  @Patch(':id/images/:imageId')
  @UseInterceptors(FilesInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Substituir imagem do produto' })
  async replaceImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      return this.findProductByIdUseCase.execute(id);
    }
    const file = files[0];
    const uuid = randomUUID();

    const mainBuffer = await sharp(file.buffer)
      .resize(800, 800, { fit: 'cover', position: 'center' })
      .webp({ quality: 90 })
      .toBuffer();

    const mainUpload = await this.minioService.uploadFile(
      {
        ...file,
        customName: `${uuid}.webp`,
        buffer: mainBuffer,
        mimetype: 'image/webp',
      } as UploadedFileType,
      'products',
    );

    const thumbBuffer = await sharp(file.buffer)
      .resize(450, 450, { fit: 'cover', position: 'center' })
      .webp({ quality: 90 })
      .toBuffer();

    await this.minioService.uploadFile(
      {
        ...file,
        customName: `${uuid}-thumb.webp`,
        buffer: thumbBuffer,
        mimetype: 'image/webp',
      } as UploadedFileType,
      'products',
    );

    const result = await this.manageProductImagesUseCase.replaceImage(
      id,
      imageId,
      mainUpload.fileName,
    );

    if (result.oldUrl && result.canDeleteOldUrl) {
      await this.minioService.deleteFile(result.oldUrl);
      const thumbUrl = result.oldUrl.replace('.webp', '-thumb.webp');
      await this.minioService.deleteFile(thumbUrl);
    }

    return {
      ...result.product,
      imageUrl: result.product?.images?.[0]?.url ?? null,
    };
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicar produto completo com estoque zerado' })
  duplicate(@Param('id') id: string) {
    return this.duplicateProductUseCase.execute(id);
  }
  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remover imagem do produto' })
  async removeImage(
    @Param('id') id: string,
    @Param('imageId') imageId: string,
  ) {
    const { image, canDeleteOldUrl } = await this.manageProductImagesUseCase.removeImage(
      id,
      imageId,
    );
    if (image.url && canDeleteOldUrl) {
      await this.minioService.deleteFile(image.url);

      const thumbUrl = image.url.replace('.webp', '-thumb.webp');
      await this.minioService.deleteFile(thumbUrl);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string) {
    const imageUrls = await this.deleteProductUseCase.execute(id);

    await Promise.all(
      imageUrls.flatMap((url) => {
        const thumbUrl = url.replace('.webp', '-thumb.webp');

        return [
          this.minioService.deleteFile(url),
          this.minioService.deleteFile(thumbUrl),
        ];
      }),
    );
  }

  @Delete(':id/variations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover todas as variações do produto',
  })
  @ApiResponse({
    status: 200,
    description:
      'Variações removidas com sucesso e o produto atualizado é retornado.',
    type: ProductResponseDto,
  })
  async deleteVariation(@Param('id') id: string) {
    return this.deleteProductVariationUseCase.execute(id);
  }

  @Delete(':id/variation-options')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Remover uma opção específica de variação do produto',
  })
  @ApiResponse({
    status: 200,
    description: 'Opção de variação removida com sucesso',
    type: ProductResponseDto,
  })
  async deleteVariationOption(
    @Param('id') id: string,
    @Body() dto: { variationId: string; optionId: string },
  ) {
    return this.deleteProductVariationOptionUseCase.execute(id, dto);
  }
}
