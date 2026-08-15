import { Module } from '@nestjs/common';
import { UsersController } from './infrastructure/controllers/users.controller';
import { PrismaUsersRepository } from './infrastructure/database/prisma-users.repository';
import { IUsersRepository } from './domain/repositories/iusers.repository';
import { ListUsersUseCase } from './domain/use-cases/list-users.use-case';
import { CreateUserUseCase } from './domain/use-cases/create-user.use-case';
import { DeleteUserUseCase } from './domain/use-cases/delete-user.use-case';
import { UpdatePushTokenUseCase } from './domain/use-cases/update-push-token.use-case';
import { TestPushNotificationUseCase } from './domain/use-cases/test-push-notification.use-case';
import { UpdateWebPushSubscriptionUseCase } from './domain/use-cases/update-web-push-subscription.use-case';
import { UpdatePasswordUseCase } from './domain/use-cases/update-password.use-case';
import { PushNotificationService } from '../../shared/services/push-notification.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [UsersController],
  providers: [
    ListUsersUseCase,
    CreateUserUseCase,
    DeleteUserUseCase,
    UpdatePushTokenUseCase,
    UpdateWebPushSubscriptionUseCase,
    TestPushNotificationUseCase,
    UpdatePasswordUseCase,
    PushNotificationService,
    {
      provide: IUsersRepository,
      useClass: PrismaUsersRepository,
    },
  ],
  exports: [IUsersRepository],
})
export class UsersModule {}
