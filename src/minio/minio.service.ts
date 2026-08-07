import { Injectable, OnModuleInit, Optional, Inject } from '@nestjs/common';
import * as Minio from 'minio';
import { randomUUID } from 'crypto';
import { UploadedFile as UploadedFileType } from '../common/types/uploaded-file.type';
import { TenantContextService } from '../modules/tenant/tenant-context.service';

@Injectable()
export class MinioService implements OnModuleInit {
  private client: Minio.Client;
  private readonly bucket = 'podemaismidia';

  constructor(
    @Optional() private readonly tenantContextService?: TenantContextService,
  ) {}

  async onModuleInit() {
    const { MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY } =
      process.env;

    if (
      !MINIO_ENDPOINT ||
      !MINIO_PORT ||
      !MINIO_ACCESS_KEY ||
      !MINIO_SECRET_KEY
    ) {
      throw new Error('MinIO env vars not defined');
    }

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

  async uploadFile(file: UploadedFileType, folder = '', storeSubdomain?: string) {
    if (!file) {
      throw new Error('Arquivo não enviado');
    }

    const tenantSubdomain = storeSubdomain || this.tenantContextService?.getSubdomain() || 'demo';

    const mimeToExt: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };

    const fileExt = mimeToExt[file.mimetype] || 'jpg';

    // MinIO folder per store: {tenantSubdomain}/{folder}/{customName | uuid.ext}
    const pathPrefix = folder ? `${tenantSubdomain}/${folder}` : tenantSubdomain;

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
