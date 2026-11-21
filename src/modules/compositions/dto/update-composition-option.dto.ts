import { PartialType } from '@nestjs/swagger';
import { CreateCompositionOptionDto } from './create-composition-option.dto';

export class UpdateCompositionOptionDto extends PartialType(CreateCompositionOptionDto) {}
