import { ApiProperty } from '@nestjs/swagger';

export class CategoryResponseDto {
  @ApiProperty({ example: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Descartáveis' })
  title: string;

  @ApiProperty()
  isVisible: boolean;
}
