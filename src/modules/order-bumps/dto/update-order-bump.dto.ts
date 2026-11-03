import { PartialType } from '@nestjs/swagger';
import { CreateOrderBumpDto } from './create-order-bump.dto';

export class UpdateOrderBumpDto extends PartialType(CreateOrderBumpDto) {}
