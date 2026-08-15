import { Controller, Get, Post, Body, Param, Delete, UseGuards, Patch } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../auth/infrastructure/guards/jwt-auth.guard';

import { CreateUserDto } from '../dtos/create-user.dto';
import { UserResponseDto } from '../dtos/user-response.dto';
import { DeleteUserDto } from '../dtos/delete-user.dto';

import { ListUsersUseCase } from '../../domain/use-cases/list-users.use-case';
import { CreateUserUseCase } from '../../domain/use-cases/create-user.use-case';
import { DeleteUserUseCase } from '../../domain/use-cases/delete-user.use-case';
import { UpdatePushTokenUseCase } from '../../domain/use-cases/update-push-token.use-case';
import { UpdateWebPushSubscriptionUseCase } from '../../domain/use-cases/update-web-push-subscription.use-case';
import { TestPushNotificationUseCase } from '../../domain/use-cases/test-push-notification.use-case';
import { UpdatePushTokenDto } from '../dtos/update-push-token.dto';
import { UpdateWebPushSubscriptionDto } from '../dtos/update-web-push-subscription.dto';
import { UpdatePasswordDto } from '../dtos/update-password.dto';
import { CurrentUser } from '../../../auth/infrastructure/decorators/current-user.decorator';
import type { JwtPayload } from '../../../auth/infrastructure/types/jwt-payload.type';
import { UpdatePasswordUseCase } from '../../domain/use-cases/update-password.use-case';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly updatePushTokenUseCase: UpdatePushTokenUseCase,
    private readonly updateWebPushSubscriptionUseCase: UpdateWebPushSubscriptionUseCase,
    private readonly testPushNotificationUseCase: TestPushNotificationUseCase,
    private readonly updatePasswordUseCase: UpdatePasswordUseCase,
  ) {}

  @Patch('password')
  @ApiOperation({ summary: 'Atualizar senha do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Senha atualizada com sucesso',
  })
  async updatePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePasswordDto,
  ) {
    await this.updatePasswordUseCase.execute(user.sub, dto);
    return { success: true };
  }

  @Get()
  @ApiOperation({ summary: 'Listar usuários' })
  @ApiResponse({
    status: 200,
    description: 'Lista de usuários',
    type: [UserResponseDto],
  })
  findAll() {
    return this.listUsersUseCase.execute();
  }

  @Post()
  @ApiOperation({ summary: 'Criar usuário' })
  @ApiResponse({
    status: 201,
    description: 'Usuário criado com sucesso',
    type: UserResponseDto,
  })
  create(@Body() dto: CreateUserDto) {
    return this.createUserUseCase.execute(dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deletar usuário' })
  @ApiResponse({
    status: 200,
    description: 'Usuário removido',
  })
  delete(@Param() params: DeleteUserDto) {
    return this.deleteUserUseCase.execute(params.id);
  }

  @Post('push-token')
  @ApiOperation({ summary: 'Registrar Expo Push Token do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Token registrado com sucesso',
  })
  async registerPushToken(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePushTokenDto,
  ) {
    await this.updatePushTokenUseCase.execute(user.sub, dto.token);
    return { success: true };
  }

  @Post('web-push-subscription')
  @ApiOperation({ summary: 'Registrar Web Push Subscription do usuário' })
  @ApiResponse({
    status: 200,
    description: 'Subscription registrada com sucesso',
  })
  async registerWebPushSubscription(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateWebPushSubscriptionDto,
  ) {
    await this.updateWebPushSubscriptionUseCase.execute(user.sub, dto.subscription);
    return { success: true };
  }

  @Post('test-push')
  @ApiOperation({ summary: 'Enviar notificação push de teste para o próprio usuário' })
  @ApiResponse({
    status: 200,
    description: 'Notificação enviada com sucesso',
  })
  async testPushNotification(
    @CurrentUser() user: JwtPayload,
  ) {
    await this.testPushNotificationUseCase.execute(user.sub);
    return { success: true };
  }
}
