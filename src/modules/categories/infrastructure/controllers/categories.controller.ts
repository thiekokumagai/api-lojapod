import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import sharp from 'sharp';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { MinioService } from '../../../../minio/minio.service';

import { CreateCategoryDto } from '../dtos/create-category.dto';
import { UpdateCategoryDto, UpdateOrderDto } from '../dtos/update-category.dto';
import { CategoryResponseDto } from '../dtos/category-response.dto';
import { UploadedFile as UploadedFileType } from '../../../../common/types/uploaded-file.type';

import { ListCategoriesUseCase } from '../../domain/use-cases/list-categories.use-case';
import { GetCategoryUseCase } from '../../domain/use-cases/get-category.use-case';
import { CreateCategoryUseCase } from '../../domain/use-cases/create-category.use-case';
import { UpdateCategoryUseCase } from '../../domain/use-cases/update-category.use-case';
import { UpdateBatchOrderUseCase } from '../../domain/use-cases/update-batch-order.use-case';
import { DeleteCategoryUseCase } from '../../domain/use-cases/delete-category.use-case';

@ApiTags('Categories')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(
    private readonly listCategoriesUseCase: ListCategoriesUseCase,
    private readonly getCategoryUseCase: GetCategoryUseCase,
    private readonly createCategoryUseCase: CreateCategoryUseCase,
    private readonly updateCategoryUseCase: UpdateCategoryUseCase,
    private readonly updateBatchOrderUseCase: UpdateBatchOrderUseCase,
    private readonly deleteCategoryUseCase: DeleteCategoryUseCase,
    private readonly minioService: MinioService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar categorias' })
  @ApiResponse({
    status: 200,
    type: [CategoryResponseDto],
  })
  findAll() {
    return this.listCategoriesUseCase.execute();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Criar categoria com imagem' })
  @ApiResponse({
    status: 201,
    type: CategoryResponseDto,
  })
  async create(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: CreateCategoryDto,
  ) {
    let image: string | null = null;

    if (file) {
      const croppedBuffer = await sharp(file.buffer)
        .resize(92, 92, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: 90 })
        .toBuffer();
      const upload = await this.minioService.uploadFile(
        {
          ...file,
          originalname: 'file.webp',
          buffer: croppedBuffer,
          mimetype: 'image/webp',
        } as UploadedFileType,
        'categories',
      );
      image = upload.fileName;
    }
    return this.createCategoryUseCase.execute({
      title: body.title,
      image,
      isVisible: body.isVisible ?? true,
      excludeFromBestSeller: body.excludeFromBestSeller ?? false,
    });
  }

  @Patch(':id')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({ summary: 'Atualizar categoria' })
  async update(
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UpdateCategoryDto,
  ) {
    let image: string | null | undefined;
    const current = await this.getCategoryUseCase.execute(id);
    if (body.removeImage) {
      if (current?.image) {
        await this.minioService.deleteFile(current.image);
      }
      image = null;
    }

    if (file) {
      if (current?.image) {
        await this.minioService.deleteFile(current.image);
      }

      const croppedBuffer = await sharp(file.buffer)
        .resize(92, 92, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: 90 })
        .toBuffer();

      const upload = await this.minioService.uploadFile(
        {
          ...file,
          originalname: 'file.webp',
          buffer: croppedBuffer,
          mimetype: 'image/webp',
        } as UploadedFileType,
        'categories',
      );

      image = upload.fileName;
    }

    return this.updateCategoryUseCase.execute(id, {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.isVisible !== undefined && { isVisible: body.isVisible }),
      ...(body.excludeFromBestSeller !== undefined && { excludeFromBestSeller: body.excludeFromBestSeller }),
      ...(image !== undefined && { image }),
    });
  }

  @Patch('batch/order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reordenar categorias' })
  async updateBatchOrder(@Body() body: UpdateOrderDto) {
    await this.updateBatchOrderUseCase.execute(body.items);
    return { success: true };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Deletar categoria' })
  async delete(@Param('id') id: string) {
    const category = await this.getCategoryUseCase.execute(id);
    if (category?.image) {
      await this.minioService.deleteFile(category.image);
    }

    await this.deleteCategoryUseCase.execute(id);
  }
}
