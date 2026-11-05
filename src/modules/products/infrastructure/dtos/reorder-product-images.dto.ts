import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class ReorderProductImagesDto {
  @ApiProperty({ description: 'IDs das imagens na nova ordem (a primeira é a principal)', type: [String] })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  imageIds: string[];
}
