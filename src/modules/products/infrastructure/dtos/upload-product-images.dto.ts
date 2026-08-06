import { ApiProperty } from '@nestjs/swagger';

export class UploadProductImagesDto {
  @ApiProperty({
    type: 'array',
    items: {
      type: 'string',
      format: 'binary',
    },
    description: 'Imagens do produto',
  })
  files: any[];
}
