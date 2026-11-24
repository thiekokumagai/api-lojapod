import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Namespace, Socket } from 'socket.io';
import { PrismaService } from '../../../../prisma/prisma.service';
import type { JwtPayload } from '../../auth/infrastructure/types/jwt-payload.type';
import { findStoreByAgentToken, readAgentToken } from '../../print/print-token';
import {
  parseDeviceId,
  parseDeviceName,
  parseScaleConfig,
  parseScaleReading,
  type ScaleConfig,
} from '../domain/scale-config';
import { ScaleRegistry } from '../domain/scale-registry';

/** Intervalo mínimo entre dois pesos repassados (~6/s). Mudança de estável/instável passa sempre. */
export const WEIGHT_MIN_INTERVAL_MS = 150;
/** Quantas balanças um PDV pode acompanhar ao mesmo tempo. */
export const MAX_WATCHES_PER_PDV = 5;
const AGENT_ACK_TIMEOUT_MS = 5000;
const AGENT_DETECT_TIMEOUT_MS = 30000;

export const scalePdvRoom = (storeId: string) => `scale-pdv:${storeId}`;
export const scaleWatchRoom = (storeId: string, deviceId: string) =>
  `scale-watch:${storeId}:${deviceId}`;

type AgentData = { kind: 'agent'; storeId: string; deviceId: string };
type PdvData = { kind: 'pdv'; storeId: string };
type ScaleSocketData = AgentData | PdvData | Record<string, never>;

type Ack<T extends object = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/**
 * Balança em tempo real pela API (namespace `/scale`).
 * - Agente (`balance-lojapod`): entra com `auth: { role: 'agent', token: <printToken>, deviceId, name }`.
 * - PDV (Admin): entra com `auth: { accessToken }`, o mesmo JWT do HTTP.
 * Tudo fica preso à loja do token: um PDV nunca vê nem comanda balança de outra loja.
 * O agente só manda peso enquanto algum PDV acompanha (`scale.stream { active }`).
 */
@WebSocketGateway({ namespace: '/scale', cors: { origin: '*' } })
export class ScaleGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Namespace;
  private readonly logger = new Logger('ScaleGateway');
  private readonly lastForwardAt = new Map<
    string,
    { at: number; stable: boolean }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly registry: ScaleRegistry,
  ) {}

  async handleConnection(client: Socket) {
    const auth = (client.handshake?.auth ?? {}) as Record<string, unknown>;
    if (auth.role === 'agent') {
      await this.connectAgent(client, auth);
    } else {
      await this.connectPdv(client, auth);
    }
  }

  handleDisconnect(client: Socket) {
    const data = client.data as ScaleSocketData;
    if (data.kind === 'agent') {
      const removed = this.registry.unregister(
        data.storeId,
        data.deviceId,
        client.id,
      );
      if (removed) {
        this.lastForwardAt.delete(`${data.storeId}:${data.deviceId}`);
        this.server
          .to(scaleWatchRoom(data.storeId, data.deviceId))
          .emit('scale.offline', { deviceId: data.deviceId });
        this.broadcastList(data.storeId);
      }
    } else if (data.kind === 'pdv') {
      for (const device of this.registry.unwatchAll(data.storeId, client.id)) {
        this.server.sockets
          .get(device.socketId)
          ?.emit('scale.stream', { active: false });
      }
      this.broadcastList(data.storeId);
    }
  }

  // ---------------------------------------------------------------- agente

  private async connectAgent(client: Socket, auth: Record<string, unknown>) {
    const token = readAgentToken(client.handshake);
    const deviceId = parseDeviceId(auth.deviceId);
    if (!token || !deviceId)
      return this.reject(
        client,
        'Token e identificação da balança são obrigatórios.',
      );

    const store = await findStoreByAgentToken(this.prisma, token);
    if (!store) return this.reject(client, 'Token inválido.');

    const result = this.registry.register({
      storeId: store.id,
      deviceId,
      name: parseDeviceName(auth.name, deviceId),
      socketId: client.id,
      version:
        typeof auth.version === 'string' ? auth.version.slice(0, 20) : null,
    });
    if ('error' in result)
      return this.reject(
        client,
        'Limite de balanças conectadas atingido para esta loja.',
      );

    client.data = {
      kind: 'agent',
      storeId: store.id,
      deviceId,
    } satisfies AgentData;
    if (result.replacedSocketId) {
      // O app reconectou: o socket antigo sai, sem tirar a balança da lista
      const old = this.server.sockets.get(result.replacedSocketId);
      if (old) {
        old.data = {};
        old.disconnect(true);
      }
    }
    client.emit('scale.ready', { storeName: store.title, deviceId });
    if (result.device.watchers.size > 0)
      client.emit('scale.stream', { active: true });
    this.broadcastList(store.id);
  }

  /** O agente informa versão, configuração atual e drivers que conhece (ao conectar e ao mudar). */
  @SubscribeMessage('scale.hello')
  handleHello(@ConnectedSocket() client: Socket, @MessageBody() body: unknown) {
    const data = client.data as ScaleSocketData;
    if (data.kind !== 'agent') return { ok: false };
    const device = this.registry.get(data.storeId, data.deviceId);
    if (!device || device.socketId !== client.id) return { ok: false };

    const b = (body ?? {}) as Record<string, unknown>;
    const parsed = parseScaleConfig(b.config);
    device.config = parsed.ok ? parsed.config : null;
    device.drivers = Array.isArray(b.drivers)
      ? b.drivers
          .filter(
            (d): d is string =>
              typeof d === 'string' && /^[a-z0-9_-]{1,30}$/.test(d),
          )
          .slice(0, 30)
      : [];
    if (typeof b.version === 'string') device.version = b.version.slice(0, 20);
    this.broadcastList(data.storeId);
    return { ok: true };
  }

  @SubscribeMessage('scale.weight')
  handleWeight(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ) {
    const data = client.data as ScaleSocketData;
    if (data.kind !== 'agent') return;
    const device = this.registry.get(data.storeId, data.deviceId);
    if (!device || device.socketId !== client.id) return;
    const reading = parseScaleReading(body);
    if (!reading) return;

    const now = Date.now();
    device.lastReading = { ...reading, at: new Date(now) };
    if (device.watchers.size === 0) return;

    const key = `${data.storeId}:${data.deviceId}`;
    const last = this.lastForwardAt.get(key);
    if (
      last &&
      last.stable === reading.stable &&
      now - last.at < WEIGHT_MIN_INTERVAL_MS
    )
      return;
    this.lastForwardAt.set(key, { at: now, stable: reading.stable });

    this.server
      .to(scaleWatchRoom(data.storeId, data.deviceId))
      .emit('scale.weight', {
        deviceId: data.deviceId,
        weightKg: reading.weightKg,
        stable: reading.stable,
        ...(reading.raw !== undefined ? { raw: reading.raw } : {}),
        at: new Date(now).toISOString(),
      });
  }

  // ---------------------------------------------------------------- PDV

  private async connectPdv(client: Socket, auth: Record<string, unknown>) {
    const accessToken = auth.accessToken;
    const secret = process.env.JWT_SECRET;
    if (typeof accessToken !== 'string' || !accessToken || !secret) {
      return this.reject(client, 'Faça login para usar a balança.');
    }
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(accessToken, { secret });
    } catch {
      client.emit('session.invalid');
      client.disconnect(true);
      return;
    }
    if (!payload?.storeId)
      return this.reject(client, 'Usuário sem loja vinculada.');

    client.data = { kind: 'pdv', storeId: payload.storeId } satisfies PdvData;
    await client.join(scalePdvRoom(payload.storeId));
    client.emit('scale.list', this.registry.list(payload.storeId));
  }

  @SubscribeMessage('scale.list')
  handleList(@ConnectedSocket() client: Socket) {
    const pdv = this.pdv(client);
    if (!pdv) return { ok: false, error: 'Sem acesso.' };
    return { ok: true, devices: this.registry.list(pdv.storeId) };
  }

  @SubscribeMessage('scale.watch')
  async handleWatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId?: unknown },
  ) {
    const pdv = this.pdv(client);
    const deviceId = parseDeviceId(body?.deviceId);
    if (!pdv || !deviceId) return { ok: false, error: 'Balança inválida.' };

    const watching = [...client.rooms].filter((r) =>
      r.startsWith(`scale-watch:${pdv.storeId}:`),
    );
    const room = scaleWatchRoom(pdv.storeId, deviceId);
    if (!client.rooms.has(room) && watching.length >= MAX_WATCHES_PER_PDV) {
      return { ok: false, error: 'Muitas balanças abertas neste aparelho.' };
    }

    const result = this.registry.watch(pdv.storeId, deviceId, client.id);
    if (!result) return { ok: false, error: 'Balança desconectada.' };
    await client.join(room);
    if (result.first)
      this.server.sockets
        .get(result.device.socketId)
        ?.emit('scale.stream', { active: true });

    const last = result.device.lastReading;
    return {
      ok: true,
      lastReading: last
        ? {
            weightKg: last.weightKg,
            stable: last.stable,
            at: last.at.toISOString(),
          }
        : null,
    };
  }

  @SubscribeMessage('scale.unwatch')
  async handleUnwatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId?: unknown },
  ) {
    const pdv = this.pdv(client);
    const deviceId = parseDeviceId(body?.deviceId);
    if (!pdv || !deviceId) return { ok: false };
    await client.leave(scaleWatchRoom(pdv.storeId, deviceId));
    const result = this.registry.unwatch(pdv.storeId, deviceId, client.id);
    if (result?.last)
      this.server.sockets
        .get(result.device.socketId)
        ?.emit('scale.stream', { active: false });
    return { ok: true };
  }

  /** Admin salva porta, marca e velocidade. Quem grava é o agente; aqui só valida e repassa. */
  @SubscribeMessage('scale.config')
  async handleConfig(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId?: unknown; config?: unknown },
  ): Promise<Ack<{ config: ScaleConfig }>> {
    const parsed = parseScaleConfig(body?.config);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const res = await this.askAgent(
      client,
      body?.deviceId,
      'scale.config',
      parsed.config,
      AGENT_ACK_TIMEOUT_MS,
    );
    if (!res.ok) return res;
    const saved = parseScaleConfig(
      (res.reply as Record<string, unknown>)?.config ?? parsed.config,
    );
    if (!saved.ok)
      return {
        ok: false,
        error: 'A balança respondeu com uma configuração inválida.',
      };

    const pdv = this.pdv(client)!;
    const device = this.registry.get(pdv.storeId, String(body?.deviceId));
    if (device) device.config = saved.config;
    this.broadcastList(pdv.storeId);
    return { ok: true, config: saved.config };
  }

  @SubscribeMessage('scale.ports')
  async handlePorts(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId?: unknown },
  ): Promise<Ack<{ ports: { path: string; label: string }[] }>> {
    const res = await this.askAgent(
      client,
      body?.deviceId,
      'scale.ports',
      {},
      AGENT_ACK_TIMEOUT_MS,
    );
    if (!res.ok) return res;
    const list = (res.reply as Record<string, unknown>)?.ports;
    const ports = (Array.isArray(list) ? list : [])
      .map((p) => {
        const item = (p ?? {}) as Record<string, unknown>;
        const path =
          typeof item.path === 'string' ? item.path.slice(0, 50) : '';
        const label =
          typeof item.label === 'string'
            ? parseDeviceName(item.label, path)
            : path;
        return { path, label };
      })
      .filter((p) => p.path)
      .slice(0, 50);
    return { ok: true, ports };
  }

  /** Auto-detectar: o agente testa portas, marcas e velocidades. Pode levar alguns segundos. */
  @SubscribeMessage('scale.detect')
  async handleDetect(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { deviceId?: unknown },
  ): Promise<Ack<{ config: ScaleConfig | null }>> {
    const res = await this.askAgent(
      client,
      body?.deviceId,
      'scale.detect',
      {},
      AGENT_DETECT_TIMEOUT_MS,
    );
    if (!res.ok) return res;
    const reply = (res.reply ?? {}) as Record<string, unknown>;
    if (reply.ok === false) {
      return {
        ok: false,
        error:
          typeof reply.error === 'string'
            ? reply.error.slice(0, 200)
            : 'Balança não encontrada.',
      };
    }
    const found = parseScaleConfig(reply.config);
    return { ok: true, config: found.ok ? found.config : null };
  }

  // ---------------------------------------------------------------- apoio

  private pdv(client: Socket): PdvData | null {
    const data = client.data as ScaleSocketData;
    return data.kind === 'pdv' ? data : null;
  }

  /** Comando do PDV para uma balança da MESMA loja, esperando a resposta do agente. */
  private async askAgent(
    client: Socket,
    rawDeviceId: unknown,
    event: string,
    payload: object,
    timeoutMs: number,
  ): Promise<{ ok: true; reply: unknown } | { ok: false; error: string }> {
    const pdv = this.pdv(client);
    const deviceId = parseDeviceId(rawDeviceId);
    if (!pdv || !deviceId) return { ok: false, error: 'Balança inválida.' };
    const device = this.registry.get(pdv.storeId, deviceId);
    const agent = device ? this.server.sockets.get(device.socketId) : undefined;
    if (!device || !agent) return { ok: false, error: 'Balança desconectada.' };

    try {
      const reply: unknown = await agent
        .timeout(timeoutMs)
        .emitWithAck(event, payload);
      const r = (reply ?? {}) as Record<string, unknown>;
      if (r.ok === false && event !== 'scale.detect') {
        return {
          ok: false,
          error:
            typeof r.error === 'string'
              ? r.error.slice(0, 200)
              : 'A balança recusou o comando.',
        };
      }
      return { ok: true, reply };
    } catch {
      return { ok: false, error: 'A balança não respondeu a tempo.' };
    }
  }

  private broadcastList(storeId: string) {
    this.server
      ?.to(scalePdvRoom(storeId))
      .emit('scale.list', this.registry.list(storeId));
  }

  private reject(client: Socket, message: string) {
    this.logger.warn(`Conexão recusada no /scale (${client.id}): ${message}`);
    client.emit('auth_error', { message });
    client.disconnect(true);
  }
}
