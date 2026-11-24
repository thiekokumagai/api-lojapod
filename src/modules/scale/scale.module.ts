import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ScaleRegistry } from './domain/scale-registry';
import { ScaleGateway } from './infrastructure/scale.gateway';

/** Balança em tempo real (namespace `/scale`). Sem tabela: quem está conectado fica só em memória. */
@Module({
  // O segredo do JWT é lido na verificação (process.env.JWT_SECRET), igual ao EventsGateway.
  imports: [JwtModule.register({})],
  providers: [ScaleRegistry, ScaleGateway],
  exports: [ScaleRegistry],
})
export class ScaleModule {}
