import { ApiProperty } from '@nestjs/swagger';

class CategoryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;
}

class ImageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;
}

class VariationOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  value: string;
}

class VariationDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: [VariationOptionDto] })
  options: VariationOptionDto[];
}

class ProductVariationDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: VariationDto })
  variation: VariationDto;
}

class ProductItemSelectedOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ type: VariationOptionDto })
  option: VariationOptionDto;
}

class ProductItemDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  stock: number;

  @ApiProperty({ required: false, nullable: true })


  @ApiProperty()
  hash: string;

  @ApiProperty({ type: [ProductItemSelectedOptionDto] })
  options: ProductItemSelectedOptionDto[];
}

export class ProductResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ type: CategoryDto })
  category: CategoryDto;

  @ApiProperty({ type: [ImageDto] })
  images: ImageDto[];

  @ApiProperty({ required: false, nullable: true })
  imageUrl?: string | null;

  @ApiProperty({ type: [ProductVariationDto] })
  variations: ProductVariationDto[];

  @ApiProperty({ type: [ProductItemDto] })
  items: ProductItemDto[];

  @ApiProperty({ required: false, nullable: true, example: '49.90' })
  price?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '39.90' })
  promotionalPrice?: string | null;

  @ApiProperty({ required: false, nullable: true, example: '25.00' })
  costPrice?: string | null;

  @ApiProperty({ required: false, nullable: true })
  isVisible?: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
