import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from '../prisma/prisma.module';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { VariationsModule } from './modules/variations/variations.module';
import { ProductsModule } from './modules/products/products.module';
import { SettingsModule } from './modules/settings/settings.module';
import { OrdersModule } from './modules/orders/orders.module';
import { CashRegistersModule } from './modules/cash-registers/cash-registers.module';
import { CouponsModule } from './modules/coupons/coupons.module';
import { FixedCostsModule } from './modules/fixed-costs/fixed-costs.module';
import { InvestmentsModule } from './modules/investments/investments.module';
import { CouriersModule } from './modules/couriers/couriers.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { CustomersModule } from './modules/customers/customers.module';
import { ImportsModule } from './modules/imports/imports.module';
import { PrintModule } from './modules/print/print.module';
import { EventsModule } from './modules/events/events.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      serveRoot: '/public',
    }),

    PrismaModule,
    AuthModule,
    UsersModule,
    CategoriesModule,
    VariationsModule,
    ProductsModule,
    SettingsModule,
    OrdersModule,
    CashRegistersModule,
    CouponsModule,
    FixedCostsModule,
    InvestmentsModule,
    CouriersModule,
    DashboardModule,
    CustomersModule,
    ImportsModule,
    PrintModule,
    EventsModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
