import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { MinioService } from '../../../../minio/minio.service';
import * as crypto from 'crypto';
import sharp from 'sharp';

@Injectable()
export class ImageMigrationService {
  private readonly logger = new Logger(ImageMigrationService.name);

  constructor(private readonly minioService: MinioService) {}

  async migrateImage(
    imageUrl: string,
    folder: string = 'vendizap-imports',
  ): Promise<string | null> {
    if (!imageUrl) return null;

    // Se a imagem já é um path interno gerado anteriormente
    if (imageUrl.startsWith(`${folder}/`)) {
      return imageUrl;
    }

    try {
      const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
      const expectedFileName = `${folder}/${hash}.webp`;

      // Verifica se a imagem já existe no MinIO para evitar re-upload
      const exists = await this.minioService.fileExists(expectedFileName);
      if (exists) {
        return expectedFileName;
      }

      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });
      const originalBuffer = Buffer.from(response.data, 'binary');

      // Process main image (800x800 webp)
      const mainBuffer = await sharp(originalBuffer)
        .resize(800, 800, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toBuffer();

      const mainUpload = await this.minioService.uploadFile(
        {
          customName: `${hash}.webp`,
          buffer: mainBuffer,
          size: mainBuffer.length,
          mimetype: 'image/webp',
        } as any,
        folder,
      );

      // Process thumbnail image (450x450 webp)
      const thumbBuffer = await sharp(originalBuffer)
        .resize(450, 450, { fit: 'cover', position: 'center' })
        .webp({ quality: 90 })
        .toBuffer();

      await this.minioService.uploadFile(
        {
          customName: `${hash}-thumb.webp`,
          buffer: thumbBuffer,
          size: thumbBuffer.length,
          mimetype: 'image/webp',
        } as any,
        folder,
      );

      return mainUpload.fileName;
    } catch (error) {
      this.logger.error(`Error migrating image ${imageUrl}`, error.message);
      return imageUrl; // Fallback to original url
    }
  }
}
