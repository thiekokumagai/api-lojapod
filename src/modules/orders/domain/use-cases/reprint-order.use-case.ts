import { Injectable, NotFoundException } from "@nestjs/common";
import { IOrdersRepository } from "../repositories/iorders.repository";
import { PrintGateway } from "../../../print/print.gateway";

@Injectable()
export class ReprintOrderUseCase {
  constructor(
    private readonly ordersRepository: IOrdersRepository,
    private readonly printGateway: PrintGateway,
  ) {}

  async execute(id: string): Promise<void> {
    const order = await this.ordersRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    this.printGateway.emitNovoPedido("1", order);
  }
}
