import { Injectable, NotFoundException } from "@nestjs/common";
import { IOrdersRepository } from "../repositories/iorders.repository";
import { PrintGateway } from "../../../print/print.gateway";
import { TenantContextService } from "../../../tenant/tenant-context.service";

@Injectable()
export class ReprintOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly printGateway: PrintGateway,
    private readonly tenantContextService: TenantContextService,
  ) {}

  async execute(id: string): Promise<void> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const printStoreId = order.storeId || this.tenantContextService.getStoreId() || "1";
    this.printGateway.emitNovoPedido(printStoreId, order);
  }
}
