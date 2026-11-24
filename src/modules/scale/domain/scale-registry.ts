import { Injectable } from '@nestjs/common';
import type { ScaleConfig, ScaleReading } from './scale-config';

/**
 * Balanças conectadas, só em memória (sem tabela): o agente se registra ao conectar e some ao cair.
 * Suposição: a API roda numa instância só. Com mais de uma, isto precisa de um adaptador (Redis).
 */

export interface ScaleDevice {
  storeId: string;
  deviceId: string;
  name: string;
  socketId: string;
  connectedAt: Date;
  version: string | null;
  config: ScaleConfig | null;
  drivers: string[];
  lastReading: (ScaleReading & { at: Date }) | null;
  /** Sockets de PDV acompanhando o peso desta balança. */
  watchers: Set<string>;
}

/** O que o PDV recebe na lista (sem socketId nem watchers). */
export interface ScaleDeviceView {
  deviceId: string;
  name: string;
  connectedAt: string;
  version: string | null;
  config: ScaleConfig | null;
  drivers: string[];
  lastReading: { weightKg: number; stable: boolean; at: string } | null;
  watching: number;
}

/** Teto de balanças por loja (evita um token vazado encher a memória). */
export const MAX_DEVICES_PER_STORE = 20;

@Injectable()
export class ScaleRegistry {
  private readonly byStore = new Map<string, Map<string, ScaleDevice>>();

  /**
   * Registra a balança. Se o mesmo deviceId já estava conectado (o app reconectou), devolve o socket
   * antigo para o gateway derrubar; os PDVs que acompanhavam continuam acompanhando.
   */
  register(input: {
    storeId: string;
    deviceId: string;
    name: string;
    socketId: string;
    version?: string | null;
  }):
    | { device: ScaleDevice; replacedSocketId: string | null }
    | { error: 'LIMIT' } {
    const devices =
      this.byStore.get(input.storeId) ?? new Map<string, ScaleDevice>();
    const previous = devices.get(input.deviceId);
    if (!previous && devices.size >= MAX_DEVICES_PER_STORE)
      return { error: 'LIMIT' };

    const device: ScaleDevice = {
      storeId: input.storeId,
      deviceId: input.deviceId,
      name: input.name,
      socketId: input.socketId,
      connectedAt: new Date(),
      version: input.version ?? null,
      config: previous?.config ?? null,
      drivers: previous?.drivers ?? [],
      lastReading: null,
      watchers: previous?.watchers ?? new Set<string>(),
    };
    devices.set(input.deviceId, device);
    this.byStore.set(input.storeId, devices);
    return {
      device,
      replacedSocketId:
        previous && previous.socketId !== input.socketId
          ? previous.socketId
          : null,
    };
  }

  /** Remove só se o socket ainda é o atual (um socket antigo caindo depois da troca não apaga o novo). */
  unregister(storeId: string, deviceId: string, socketId: string): boolean {
    const devices = this.byStore.get(storeId);
    const device = devices?.get(deviceId);
    if (!devices || !device || device.socketId !== socketId) return false;
    devices.delete(deviceId);
    if (devices.size === 0) this.byStore.delete(storeId);
    return true;
  }

  get(storeId: string, deviceId: string): ScaleDevice | null {
    return this.byStore.get(storeId)?.get(deviceId) ?? null;
  }

  list(storeId: string): ScaleDeviceView[] {
    return [...(this.byStore.get(storeId)?.values() ?? [])]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .map(toView);
  }

  /** Marca o PDV como acompanhando. Devolve true se é o primeiro (o agente deve começar a mandar o peso). */
  watch(
    storeId: string,
    deviceId: string,
    pdvSocketId: string,
  ): { device: ScaleDevice; first: boolean } | null {
    const device = this.get(storeId, deviceId);
    if (!device) return null;
    const wasEmpty = device.watchers.size === 0;
    device.watchers.add(pdvSocketId);
    return { device, first: wasEmpty };
  }

  /** Devolve true se não sobrou ninguém acompanhando (o agente pode parar de mandar). */
  unwatch(
    storeId: string,
    deviceId: string,
    pdvSocketId: string,
  ): { device: ScaleDevice; last: boolean } | null {
    const device = this.get(storeId, deviceId);
    if (!device || !device.watchers.delete(pdvSocketId)) return null;
    return { device, last: device.watchers.size === 0 };
  }

  /** PDV desconectou: sai de todas as balanças da loja. Devolve as que ficaram sem ninguém. */
  unwatchAll(storeId: string, pdvSocketId: string): ScaleDevice[] {
    const emptied: ScaleDevice[] = [];
    for (const device of this.byStore.get(storeId)?.values() ?? []) {
      if (device.watchers.delete(pdvSocketId) && device.watchers.size === 0)
        emptied.push(device);
    }
    return emptied;
  }
}

function toView(d: ScaleDevice): ScaleDeviceView {
  return {
    deviceId: d.deviceId,
    name: d.name,
    connectedAt: d.connectedAt.toISOString(),
    version: d.version,
    config: d.config,
    drivers: d.drivers,
    lastReading: d.lastReading
      ? {
          weightKg: d.lastReading.weightKg,
          stable: d.lastReading.stable,
          at: d.lastReading.at.toISOString(),
        }
      : null,
    watching: d.watchers.size,
  };
}
