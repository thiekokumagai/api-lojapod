import { Module } from '@nestjs/common';
import { CustomersController } from './infrastructure/controllers/customers.controller';
import { PrismaCustomersRepository } from './infrastructure/database/prisma-customers.repository';
import { ListCustomersUseCase } from './domain/use-cases/list-customers.use-case';
import { GetCustomerUseCase } from './domain/use-cases/get-customer.use-case';
import { UpdateCustomerUseCase } from './domain/use-cases/update-customer.use-case';
import { AddCustomerAddressUseCase } from './domain/use-cases/add-customer-address.use-case';
import { CreateCustomerUseCase } from './domain/use-cases/create-customer.use-case';
import { UpdateCustomerAddressUseCase } from './domain/use-cases/update-customer-address.use-case';

@Module({
  controllers: [CustomersController],
  providers: [
    ListCustomersUseCase,
    GetCustomerUseCase,
    UpdateCustomerUseCase,
    AddCustomerAddressUseCase,
    CreateCustomerUseCase,
    UpdateCustomerAddressUseCase,
    {
      provide: 'ICustomersRepository',
      useClass: PrismaCustomersRepository,
    },
  ],
  exports: ['ICustomersRepository'],
})
export class CustomersModule {}
