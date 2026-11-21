import { PartialType } from '@nestjs/swagger';
import { CreateCompositionGroupDto } from './create-composition-group.dto';

export class UpdateCompositionGroupDto extends PartialType(CreateCompositionGroupDto) {}
