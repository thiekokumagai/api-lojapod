import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { UploadedFile as UploadedFileType } from '../common/types/uploaded-file.type';
import { TenantContextService } from '../modules/tenant/tenant-context.service';

@Injectable()
export class MinioService implements OnModuleInit {
  private client: Minio.Client;
  private bucket: string;

  constructor(
    @Optional() private readonly tenantContextService?: TenantContextService,
  ) {}

  async onModuleInit() {
    const {
      MINIO_ENDPOINT,
      MINIO_PORT,
      MINIO_ACCESS_KEY,
      MINIO_SECRET_KEY,
      MINIO_BUCKET,
    } = process.env;

    if (
      !MINIO_ENDPOINT ||
      !MINIO_PORT ||
      !MINIO_ACCESS_KEY ||
      !MINIO_SECRET_KEY ||
      !MINIO_BUCKET
    ) {
      throw new Error('MinIO env vars not defined');
    }

    this.bucket = MINIO_BUCKET;

    this.client = new Minio.Client({
      endPoint: MINIO_ENDPOINT,
      port: Number(MINIO_PORT),
      useSSL: true,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
    });

    await this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);

      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
      }
    } catch (error) {
      console.error(`[MinioService] Error checking/creating bucket: ${error.message}`);
    }
  }

  async uploadFile(file: UploadedFileType, folder = '', storeId?: string) {
    if (!file) {
      throw new Error('Arquivo não enviado');
    }

    const tenantStoreId = storeId || this.tenantContextService?.getStoreId();

    if (!tenantStoreId) {
      throw new Error('Loja não identificada para o upload');
    }

    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    const fileExt = mimeToExt[file.mimetype] || 'jpg';

    // Object path inside the bucket: {storeId}/{module}/{customName | uuid.ext}
    const pathPrefix = folder ? `${tenantStoreId}/${folder}` : tenantStoreId;

    const fileName = file.customName
      ? `${pathPrefix}/${file.customName}`
      : `${pathPrefix}/${randomUUID()}.${fileExt}`;

    await this.client.putObject(this.bucket, fileName, file.buffer, file.size, {
      'Content-Type': file.mimetype,
    });

    return {
      fileName,
    };
  }

  async deleteFile(fileName: string) {
    if (!fileName) return;

    await this.client.removeObject(this.bucket, fileName);
  }

  async fileExists(fileName: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, fileName);
      return true;
    } catch (error) {
      return false;
    }
  }
}
