import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import sharp from 'sharp';
import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';
import { MinioService } from '../../../../minio/minio.service';
import { CombosService } from '../services/combos.service';
import { CreateComboDto } from '../dtos/create-combo.dto';
import { UpdateComboDto } from '../dtos/update-combo.dto';
import { UploadedFile as UploadedFileType } from '../../../../common/types/uploaded-file.type';

@ApiTags('Combos')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('combos')
export class CombosController {
  constructor(
    private readonly combosService: CombosService,
    private readonly minioService: MinioService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar combos (painel administrativo)' })
  async findMany(
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    const filters: any = {};
    if (search) filters.search = search;
    if (isActive !== undefined && isActive !== '') {
      filters.isActive = isActive === 'true';
    }
    if (categoryId) filters.categoryId = categoryId;

    return this.combosService.findMany(filters);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Visualizar detalhes de um combo' })
  async findById(@Param('id') id: string) {
    return this.combosService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar novo combo' })
  async create(@Body() dto: CreateComboDto) {
    return this.combosService.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar combo existente' })
  async update(@Param('id') id: string, @Body() dto: UpdateComboDto) {
    return this.combosService.update(id, dto);
  }

  @Post(':id/duplicate')
  @ApiOperation({ summary: 'Duplicar um combo' })
  async duplicate(@Param('id') id: string) {
    return this.combosService.duplicate(id);
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'Ativar ou desativar combo' })
  async toggleActive(@Param('id') id: string) {
    return this.combosService.toggleActive(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir combo' })
  async delete(@Param('id') id: string) {
    await this.combosService.delete(id);
    return { success: true };
  }

  @Post('upload-image')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Fazer upload da imagem do combo' })
  async uploadImage(@UploadedFile() file: any) {
    if (!file) {
      throw new Error('Arquivo não fornecido');
    }

    const compressed = await sharp(file.buffer)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();

    const upload = await this.minioService.uploadFile(
      {
        ...file,
        originalname: 'combo.webp',
        buffer: compressed,
        mimetype: 'image/webp',
      },
      'combos',
    );

    return { url: upload.fileName };
  }
}
