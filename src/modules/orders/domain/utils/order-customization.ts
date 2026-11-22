import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../../../../prisma/prisma.service';
import { productAllowedPrices, round2 } from './public-order-rules';

/**
 * Montagem só existe em produto: combo, item sem productId ou sem isCustomized
 * nunca leva snapshot (seria gravado cru e impresso na cozinha).
 */
export function resetNonProductCustomization(item: any): boolean {
  if (item.isCombo || item.comboId || !item.productId) {
    item.isCustomized = false;
    item.customizationSnapshot = undefined;
    return true;
  }
  return false;
}

/**
 * Valida e calcula os preços permitidos e o snapshot saneado para um produto
 * com composição por etapas (PodiPedir).
 * Do payload só valem optionId e quantity: grupo, nome, preço, cota grátis e limites vêm do banco.
 */
export async function resolveCustomizedAllowedPrices(
  prod: any,
  item: any,
  prisma: PrismaService,
  storeId?: string,
): Promise<{ allowedPrices: number[]; sanitizedSnapshot: any }> {
  if (!prod.isCustomizable) {
    throw new BadRequestException(
      `Produto "${prod.title}" não aceita montagem.`,
    );
  }
  const basePrices = productAllowedPrices(prod);
  const snapshot = item.customizationSnapshot;
  if (!snapshot || !Array.isArray(snapshot.stages)) {
    throw new BadRequestException(
      'Estrutura de personalização do produto inválida.',
    );
  }

  const targetStoreId = prod.storeId || storeId;

  // 1. Validar estrutura e somar a quantidade pedida de cada opção (ordem do payload preservada)
  const requestedQty = new Map<string, number>();
  for (const stage of snapshot.stages) {
    if (!stage || typeof stage !== 'object') {
      throw new BadRequestException('Etapa de personalização inválida.');
    }
    const optionsInput = Array.isArray(stage.options) ? stage.options : [];
    for (const opt of optionsInput) {
      if (!opt || typeof opt !== 'object') {
        throw new BadRequestException('Opção de personalização inválida.');
      }
      if (
        !opt.optionId ||
        typeof opt.optionId !== 'string' ||
        !opt.optionId.trim()
      ) {
        throw new BadRequestException(
          'Identificador da opção de personalização é obrigatório.',
        );
      }
      if (!Number.isInteger(opt.quantity) || opt.quantity < 1) {
        throw new BadRequestException(
          'A quantidade de cada opção personalizada deve ser um número inteiro positivo maior ou igual a 1.',
        );
      }
      const id = opt.optionId.trim();
      requestedQty.set(id, (requestedQty.get(id) ?? 0) + opt.quantity);
    }
  }

  const basePrice = Number(prod.price) || 0;
  if (requestedQty.size === 0) {
    return {
      allowedPrices: basePrices,
      sanitizedSnapshot: {
        basePrice,
        stages: [],
        totalAdditions: 0,
        totalCost: 0,
        finalUnitPrice: basePrice,
      },
    };
  }

  // 2. Consulta com isolamento de tenant no Prisma
  const [dbOptions, productCompositions] = await Promise.all([
    prisma.compositionOption.findMany({
      where: {
        id: { in: [...requestedQty.keys()] },
        isActive: true,
        group: { storeId: targetStoreId, isActive: true },
      },
      include: { group: true },
    }),
    prisma.productComposition.findMany({
      where: {
        productId: prod.id,
        group: { storeId: targetStoreId, isActive: true },
      },
      include: { group: true },
    }),
  ]);

  const dbOptionMap = new Map(dbOptions.map((o) => [o.id, o]));
  const pcMap = new Map(productCompositions.map((pc) => [pc.groupId, pc]));

  // 3. Agrupar pelo grupo real da opção; o grupo tem que estar ligado a este produto
  const byGroup = new Map<string, { dbOption: any; qty: number }[]>();
  for (const [optId, qty] of requestedQty) {
    const dbOption = dbOptionMap.get(optId);
    if (!dbOption || !pcMap.has(dbOption.groupId)) {
      throw new BadRequestException(
        'Uma ou mais opções de personalização são inválidas ou não pertencem a este produto.',
      );
    }
    const maxPerItem = Number(dbOption.maxQuantityPerItem ?? 1);
    if (qty > maxPerItem) {
      throw new BadRequestException(
        `A opção "${dbOption.name}" aceita no máximo ${maxPerItem} unidade(s).`,
      );
    }
    const list = byGroup.get(dbOption.groupId) ?? [];
    list.push({ dbOption, qty });
    byGroup.set(dbOption.groupId, list);
  }

  // 4. Por grupo: limite do grupo, cota grátis uma vez e cobrança unidade a unidade
  let additionsSum = 0;
  let costSum = 0;
  const sanitizedStages: { sortOrder: number; stage: any }[] = [];
  for (const [groupId, selected] of byGroup) {
    const pc = pcMap.get(groupId)!;
    const maxQty = pc.customMaxQuantity ?? pc.group.maxQuantity;
    const freeSlots = pc.customFreeQuantity ?? pc.group.freeQuantity ?? 0;
    const groupQty = selected.reduce((sum, s) => sum + s.qty, 0);
    if (maxQty !== null && maxQty !== undefined && groupQty > maxQty) {
      throw new BadRequestException(
        `A etapa "${pc.group.name}" aceita no máximo ${maxQty} escolha(s).`,
      );
    }

    // Mesma ordem do front (sortOrder da opção): as primeiras unidades da etapa são as grátis
    selected.sort(
      (a, b) => (a.dbOption.sortOrder ?? 0) - (b.dbOption.sortOrder ?? 0),
    );
    let usedFree = 0;
    const stageOptions = selected.map(({ dbOption, qty }) => {
      const unitPrice = Number(dbOption.price) || 0;
      const unitCost = Math.max(0, Number(dbOption.costPrice) || 0);
      const freeHere = Math.min(qty, Math.max(0, freeSlots - usedFree));
      usedFree += freeHere;
      const totalPrice = round2(unitPrice * (qty - freeHere));
      const optionTotalCost = round2(unitCost * qty);
      additionsSum += totalPrice;
      costSum += optionTotalCost;
      return {
        optionId: dbOption.id,
        name: dbOption.name,
        quantity: qty,
        unitPrice,
        totalPrice,
        unitCost,
        totalCost: optionTotalCost,
      };
    });

    sanitizedStages.push({
      sortOrder: pc.sortOrder ?? 0,
      stage: { groupId, groupName: pc.group.name, options: stageOptions },
    });
  }

  additionsSum = Math.max(0, round2(additionsSum));
  const totalCost = Math.max(0, round2(costSum));
  const finalUnitPrice = round2(basePrice + additionsSum);

  return {
    allowedPrices: basePrices.map((base) => round2(base + additionsSum)),
    sanitizedSnapshot: {
      basePrice,
      stages: sanitizedStages
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => s.stage),
      totalAdditions: additionsSum,
      totalCost,
      finalUnitPrice,
    },
  };
}
