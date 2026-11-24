import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';

@Global()
@Module({
  // O segredo é lido na verificação (process.env.JWT_SECRET), igual ao JwtStrategy.
  imports: [JwtModule.register({})],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
