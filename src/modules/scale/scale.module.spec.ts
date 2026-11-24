import { Test } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ScaleModule } from './scale.module';
import { ScaleGateway } from './infrastructure/scale.gateway';

@Global()
@Module({
  providers: [{ provide: PrismaService, useValue: {} }],
  exports: [PrismaService],
})
class FakePrismaModule {}

describe('ScaleModule', () => {
  it('monta o gateway com as dependências do Nest', async () => {
    const mod = await Test.createTestingModule({
      imports: [FakePrismaModule, ScaleModule],
    }).compile();
    expect(mod.get(ScaleGateway)).toBeInstanceOf(ScaleGateway);
  });
});
