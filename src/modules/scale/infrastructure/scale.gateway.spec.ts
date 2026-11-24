import { JwtService } from '@nestjs/jwt';
import {
  ScaleGateway,
  WEIGHT_MIN_INTERVAL_MS,
  scaleWatchRoom,
} from './scale.gateway';
import { ScaleRegistry } from '../domain/scale-registry';

const SECRET = 'segredo-de-teste';
const STORE_A = 'store-a';
const STORE_B = 'store-b';
const TOKENS: Record<string, { id: string; title: string }> = {
  'TOKEN-A': { id: STORE_A, title: 'Loja A' },
  'TOKEN-B': { id: STORE_B, title: 'Loja B' },
};

type FakeSocket = ReturnType<typeof makeSocket>;

function makeSocket(id: string, auth: Record<string, unknown>) {
  const rooms = new Set<string>([id]);
  return {
    id,
    rooms,
    data: {} as Record<string, any>,
    handshake: { auth, query: {} },
    emit: jest.fn(),
    disconnect: jest.fn(),
    join: jest.fn(async (r: string) => {
      rooms.add(r);
    }),
    leave: jest.fn(async (r: string) => {
      rooms.delete(r);
    }),
    ackReply: undefined as unknown,
    timeout: jest.fn(function (this: any) {
      return { emitWithAck: jest.fn(async () => this.ackReply) };
    }),
  };
}

function setup() {
  const sockets = new Map<string, FakeSocket>();
  const roomEmits: { room: string; event: string; payload: unknown }[] = [];
  const server = {
    sockets,
    to: jest.fn((room: string) => ({
      emit: (event: string, payload: unknown) =>
        roomEmits.push({ room, event, payload }),
    })),
  };
  const prisma = {
    store: {
      findFirst: jest.fn(({ where }: any) =>
        Promise.resolve(TOKENS[where.printToken.equals] ?? null),
      ),
    },
  };
  const registry = new ScaleRegistry();
  const gateway = new ScaleGateway(
    prisma as never,
    new JwtService({}),
    registry,
  );
  gateway.server = server as never;

  const connect = async (id: string, auth: Record<string, unknown>) => {
    const s = makeSocket(id, auth);
    sockets.set(id, s);
    await gateway.handleConnection(s as never);
    return s;
  };
  const jwt = (storeId: string | null, secret = SECRET) =>
    new JwtService({}).sign(
      { sub: 'u1', role: 'ADMIN', storeId },
      { secret, expiresIn: '5m' },
    );

  return { gateway, registry, server, roomEmits, connect, jwt };
}

describe('ScaleGateway', () => {
  const OLD = process.env.JWT_SECRET;
  beforeAll(() => (process.env.JWT_SECRET = SECRET));
  afterAll(() => (process.env.JWT_SECRET = OLD));

  it('agente com token da impressora registra a balança da loja do token', async () => {
    const { connect, registry } = setup();
    const agent = await connect('ag1', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
      name: 'Balança Caixa 1',
    });
    expect(agent.disconnect).not.toHaveBeenCalled();
    expect(agent.emit).toHaveBeenCalledWith('scale.ready', {
      storeName: 'Loja A',
      deviceId: 'caixa-1',
    });
    expect(registry.list(STORE_A)).toEqual([
      expect.objectContaining({ deviceId: 'caixa-1', name: 'Balança Caixa 1' }),
    ]);
  });

  it('agente com token inválido é recusado', async () => {
    const { connect, registry } = setup();
    const agent = await connect('ag1', {
      role: 'agent',
      token: 'ERRADO',
      deviceId: 'caixa-1',
    });
    expect(agent.emit).toHaveBeenCalledWith('auth_error', expect.anything());
    expect(agent.disconnect).toHaveBeenCalled();
    expect(registry.list(STORE_A)).toEqual([]);
  });

  it('agente sem deviceId válido é recusado', async () => {
    const { connect } = setup();
    const agent = await connect('ag1', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: '../x',
    });
    expect(agent.disconnect).toHaveBeenCalled();
  });

  it('PDV sem login, com login de outro segredo ou sem loja é recusado', async () => {
    const { connect, jwt } = setup();
    expect((await connect('p1', {})).disconnect).toHaveBeenCalled();
    const bad = await connect('p2', { accessToken: jwt(STORE_A, 'outro') });
    expect(bad.emit).toHaveBeenCalledWith('session.invalid');
    expect(bad.disconnect).toHaveBeenCalled();
    expect(
      (await connect('p3', { accessToken: jwt(null) })).disconnect,
    ).toHaveBeenCalled();
  });

  it('PDV só vê e só acompanha balança da própria loja', async () => {
    const { connect, jwt, gateway } = setup();
    await connect('agA', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
    });
    const pdvB = await connect('pB', { accessToken: jwt(STORE_B) });

    expect(pdvB.emit).toHaveBeenCalledWith('scale.list', []);
    await expect(
      gateway.handleWatch(pdvB as never, { deviceId: 'caixa-1' }),
    ).resolves.toEqual({
      ok: false,
      error: 'Balança desconectada.',
    });
    await expect(
      gateway.handleConfig(pdvB as never, {
        deviceId: 'caixa-1',
        config: { port: 'COM3', protocol: 'toledo', baudRate: 9600 },
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it('peso só vai para quem acompanha; o agente é avisado para começar e parar', async () => {
    const { connect, jwt, gateway, roomEmits } = setup();
    const agent = await connect('agA', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
    });
    const pdv = await connect('pA', { accessToken: jwt(STORE_A) });

    // ninguém acompanhando: o peso não é repassado
    gateway.handleWeight(agent as never, { weightKg: 0.5, stable: true });
    expect(roomEmits.filter((e) => e.event === 'scale.weight')).toHaveLength(0);

    await expect(
      gateway.handleWatch(pdv as never, { deviceId: 'caixa-1' }),
    ).resolves.toMatchObject({
      ok: true,
      lastReading: expect.objectContaining({ weightKg: 0.5 }),
    });
    expect(agent.emit).toHaveBeenCalledWith('scale.stream', { active: true });

    gateway.handleWeight(agent as never, {
      weightKg: 0.7,
      stable: true,
      raw: 'ST,GS,0.700kg',
    });
    expect(roomEmits).toContainEqual({
      room: scaleWatchRoom(STORE_A, 'caixa-1'),
      event: 'scale.weight',
      payload: expect.objectContaining({
        deviceId: 'caixa-1',
        weightKg: 0.7,
        stable: true,
        raw: 'ST,GS,0.700kg',
      }),
    });

    await gateway.handleUnwatch(pdv as never, { deviceId: 'caixa-1' });
    expect(agent.emit).toHaveBeenCalledWith('scale.stream', { active: false });
  });

  it('limita a frequência do peso, mas mudança de estável passa na hora', async () => {
    const { connect, jwt, gateway, roomEmits } = setup();
    const agent = await connect('agA', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
    });
    const pdv = await connect('pA', { accessToken: jwt(STORE_A) });
    await gateway.handleWatch(pdv as never, { deviceId: 'caixa-1' });

    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    gateway.handleWeight(agent as never, { weightKg: 0.1, stable: false });
    gateway.handleWeight(agent as never, { weightKg: 0.2, stable: false }); // descartado (mesmo instante)
    gateway.handleWeight(agent as never, { weightKg: 0.2, stable: true }); // passa: ficou estável
    now.mockReturnValue(1_000_000 + WEIGHT_MIN_INTERVAL_MS + 1);
    gateway.handleWeight(agent as never, { weightKg: 0.25, stable: true });
    now.mockRestore();

    const weights = roomEmits
      .filter((e) => e.event === 'scale.weight')
      .map((e) => (e.payload as any).weightKg);
    expect(weights).toEqual([0.1, 0.2, 0.25]);
  });

  it('configuração inválida não chega ao agente; válida é repassada e salva', async () => {
    const { connect, jwt, gateway, registry } = setup();
    const agent = await connect('agA', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
    });
    const pdv = await connect('pA', { accessToken: jwt(STORE_A) });

    await expect(
      gateway.handleConfig(pdv as never, {
        deviceId: 'caixa-1',
        config: { port: 'rm -rf', protocol: 'toledo', baudRate: 9600 },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: expect.stringMatching(/Porta/),
    });
    expect(agent.timeout).not.toHaveBeenCalled();

    agent.ackReply = { ok: true };
    await expect(
      gateway.handleConfig(pdv as never, {
        deviceId: 'caixa-1',
        config: { port: 'com3', protocol: 'toledo', baudRate: 9600 },
      }),
    ).resolves.toEqual({
      ok: true,
      config: {
        port: 'COM3',
        protocol: 'toledo',
        baudRate: 9600,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
      },
    });
    expect(registry.get(STORE_A, 'caixa-1')?.config?.port).toBe('COM3');
  });

  it('agente que não responde a tempo devolve erro ao PDV', async () => {
    const { connect, jwt, gateway } = setup();
    const agent = await connect('agA', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
    });
    agent.timeout.mockReturnValue({
      emitWithAck: jest.fn().mockRejectedValue(new Error('timeout')),
    } as never);
    const pdv = await connect('pA', { accessToken: jwt(STORE_A) });
    await expect(
      gateway.handlePorts(pdv as never, { deviceId: 'caixa-1' }),
    ).resolves.toEqual({
      ok: false,
      error: 'A balança não respondeu a tempo.',
    });
  });

  it('agente que cai avisa os PDVs e sai da lista; reconexão com o mesmo deviceId troca o socket', async () => {
    const { connect, jwt, gateway, registry, roomEmits } = setup();
    const first = await connect('ag1', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
    });
    const pdv = await connect('pA', { accessToken: jwt(STORE_A) });
    await gateway.handleWatch(pdv as never, { deviceId: 'caixa-1' });

    const second = await connect('ag2', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
    });
    expect(first.disconnect).toHaveBeenCalled();
    // o socket antigo caindo depois não remove o novo
    gateway.handleDisconnect(first as never);
    expect(registry.get(STORE_A, 'caixa-1')?.socketId).toBe('ag2');
    // quem acompanhava continua: o novo agente já começa mandando
    expect(second.emit).toHaveBeenCalledWith('scale.stream', { active: true });

    gateway.handleDisconnect(second as never);
    expect(registry.list(STORE_A)).toEqual([]);
    expect(roomEmits).toContainEqual({
      room: scaleWatchRoom(STORE_A, 'caixa-1'),
      event: 'scale.offline',
      payload: { deviceId: 'caixa-1' },
    });
  });

  it('PDV que fecha para de pedir peso ao agente', async () => {
    const { connect, jwt, gateway } = setup();
    const agent = await connect('agA', {
      role: 'agent',
      token: 'TOKEN-A',
      deviceId: 'caixa-1',
    });
    const pdv = await connect('pA', { accessToken: jwt(STORE_A) });
    await gateway.handleWatch(pdv as never, { deviceId: 'caixa-1' });
    gateway.handleDisconnect(pdv as never);
    expect(agent.emit).toHaveBeenLastCalledWith('scale.stream', {
      active: false,
    });
  });
});
