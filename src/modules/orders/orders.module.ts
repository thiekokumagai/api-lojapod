import { Module } from '@nestjs/common';
import { OrdersController } from './infrastructure/controllers/orders.controller';
import { StoreOrdersController } from './infrastructure/controllers/store-orders.controller';
import { IOrdersRepository } from './domain/repositories/iorders.repository';
import { PrismaOrdersRepository } from './infrastructure/database/prisma-orders.repository';

import { ListOrdersUseCase } from './domain/use-cases/list-orders.use-case';
import { GetOrderDetailUseCase } from './domain/use-cases/get-order-detail.use-case';
import { CancelOrderUseCase } from './domain/use-cases/cancel-order.use-case';
import { CreateOrderUseCase } from './domain/use-cases/create-order.use-case';
import { UpdateOrderStatusUseCase } from './domain/use-cases/update-order-status.use-case';
import { ReceiveOrderUseCase } from './domain/use-cases/receive-order.use-case';
import { RevertReceiveOrderUseCase } from './domain/use-cases/revert-receive-order.use-case';
import { MarkOrderPrintedUseCase } from './domain/use-cases/mark-order-printed.use-case';
import { ReprintOrderUseCase } from './domain/use-cases/reprint-order.use-case';
import { UpdateOrderUseCase } from './domain/use-cases/update-order.use-case';
import { SettingsModule } from '../settings/settings.module';
import { CouponsModule } from '../coupons/coupons.module';
import { UsersModule } from '../users/users.module';
import { PrintModule } from '../print/print.module';
import { PushNotificationService } from '../../shared/services/push-notification.service';

@Module({
  imports: [SettingsModule, CouponsModule, UsersModule, PrintModule],
  controllers: [OrdersController, StoreOrdersController],
  providers: [
    PushNotificationService,
    ListOrdersUseCase,
    GetOrderDetailUseCase,
    CancelOrderUseCase,
    CreateOrderUseCase,
    UpdateOrderStatusUseCase,
    ReceiveOrderUseCase,
    RevertReceiveOrderUseCase,
    MarkOrderPrintedUseCase,
    ReprintOrderUseCase,
    UpdateOrderUseCase,
    {
      provide: IOrdersRepository,
      useClass: PrismaOrdersRepository,
    },
  ],
  exports: [IOrdersRepository],
})
export class OrdersModule {}
