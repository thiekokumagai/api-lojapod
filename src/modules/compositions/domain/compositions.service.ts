import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { TenantContextService } from '../../tenant/tenant-context.service';
import { CreateCompositionGroupDto } from '../dto/create-composition-group.dto';
import { UpdateCompositionGroupDto } from '../dto/update-composition-group.dto';
import { CreateCompositionOptionDto } from '../dto/create-composition-option.dto';
import { UpdateCompositionOptionDto } from '../dto/update-composition-option.dto';
import { SyncProductCompositionsDto } from '../dto/attach-composition-product.dto';

@Injectable()
export class CompositionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContextService: TenantContextService,
  ) {}

  private resolveStoreId(): string {
    const storeId = this.tenantContextService.getStoreId();
    if (!storeId) {
      throw new BadRequestException('Contexto de loja (storeId) obrigatório.');
    }
    return storeId;
  }

  async listGroupsForAdmin() {
    const storeId = this.resolveStoreId();
    return this.prisma.compositionGroup.findMany({
      where: { storeId },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
        },
        _count: {
          select: { productCompositions: true },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findGroupById(id: string) {
    const storeId = this.resolveStoreId();
    const group = await this.prisma.compositionGroup.findFirst({
      where: { id, storeId },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
        },
        productCompositions: {
          include: {
            product: {
              select: { id: true, title: true, isCustomizable: true },
            },
          },
        },
      },
    });
    if (!group) {
      throw new NotFoundException('Grupo de composição não encontrado.');
    }
    return group;
  }

  async createGroup(dto: CreateCompositionGroupDto) {
    const storeId = this.resolveStoreId();
    const { options, ...groupData } = dto;

    return this.prisma.compositionGroup.create({
      data: {
        ...groupData,
        storeId,
        options:
          options && options.length > 0
            ? {
                create: options.map((opt, idx) => ({
                  name: opt.name,
                  description: opt.description,
                  imageUrl: opt.imageUrl,
                  price: Number(opt.price) || 0,
                  costPrice: Number(opt.costPrice) || 0,
                  maxQuantityPerItem: opt.maxQuantityPerItem ?? 1,
                  sortOrder: opt.sortOrder ?? idx,
                  isActive: opt.isActive ?? true,
                  linkedProductId: opt.linkedProductId || null,
                })),
              }
            : undefined,
      },
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async updateGroup(id: string, dto: UpdateCompositionGroupDto) {
    await this.findGroupById(id);
    const { options: _options, ...data } = dto;

    return this.prisma.compositionGroup.update({
      where: { id },
      data,
      include: {
        options: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
  }

  async deleteGroup(id: string) {
    await this.findGroupById(id);
    return this.prisma.compositionGroup.delete({
      where: { id },
    });
  }

  async createOption(groupId: string, dto: CreateCompositionOptionDto) {
    await this.findGroupById(groupId);
    return this.prisma.compositionOption.create({
      data: {
        ...dto,
        price: Number(dto.price) || 0,
        costPrice: Number(dto.costPrice) || 0,
        groupId,
      },
    });
  }

  async updateOption(id: string, dto: UpdateCompositionOptionDto) {
    const option = await this.prisma.compositionOption.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!option || option.group.storeId !== this.resolveStoreId()) {
      throw new NotFoundException('Opção de composição não encontrada.');
    }

    return this.prisma.compositionOption.update({
      where: { id },
      data: {
        ...dto,
        price: dto.price !== undefined ? Number(dto.price) : undefined,
        costPrice:
          dto.costPrice !== undefined ? Number(dto.costPrice) : undefined,
      },
    });
  }

  async deleteOption(id: string) {
    const option = await this.prisma.compositionOption.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!option || option.group.storeId !== this.resolveStoreId()) {
      throw new NotFoundException('Opção de composição não encontrada.');
    }

    return this.prisma.compositionOption.delete({
      where: { id },
    });
  }

  async getProductCompositions(productId: string) {
    const storeId = this.resolveStoreId();
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }

    return this.prisma.productComposition.findMany({
      where: { productId },
      include: {
        group: {
          include: {
            options: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async syncProductCompositions(
    productId: string,
    dto: SyncProductCompositionsDto,
  ) {
    const storeId = this.resolveStoreId();
    const product = await this.prisma.product.findFirst({
      where: { id: productId, storeId },
    });
    if (!product) {
      throw new NotFoundException('Produto não encontrado.');
    }

    // Deduplica grupos pelo groupId (mantém a primeira ocorrência na ordem enviada)
    const seenGroupIds = new Set<string>();
    const uniqueGroups = (dto.groups ?? []).filter((item) => {
      if (!item?.groupId || seenGroupIds.has(item.groupId)) {
        return false;
      }
      seenGroupIds.add(item.groupId);
      return true;
    });

    // Só grupos desta loja podem ser ligados ao produto
    const groupIds = [...seenGroupIds];
    if (groupIds.length > 0) {
      const ownGroups = await this.prisma.compositionGroup.findMany({
        where: { id: { in: groupIds }, storeId },
        select: { id: true },
      });
      if (ownGroups.length !== groupIds.length) {
        throw new BadRequestException(
          'Um ou mais grupos de composição não pertencem a esta loja.',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Remove vínculos antigos
      await tx.productComposition.deleteMany({
        where: { productId },
      });

      if (uniqueGroups.length > 0) {
        // Marca o produto como customizável
        await tx.product.update({
          where: { id: productId },
          data: { isCustomizable: true },
        });

        // Cria novos vínculos
        for (let idx = 0; idx < uniqueGroups.length; idx++) {
          const item = uniqueGroups[idx];
          await tx.productComposition.create({
            data: {
              productId,
              groupId: item.groupId,
              sortOrder: item.sortOrder ?? idx,
              customMinQuantity: item.customMinQuantity,
              customMaxQuantity: item.customMaxQuantity,
              customFreeQuantity: item.customFreeQuantity,
            },
          });
        }
      } else {
        // Se desmarcou todos os grupos, desativa customização
        await tx.product.update({
          where: { id: productId },
          data: { isCustomizable: false },
        });
      }

      return tx.productComposition.findMany({
        where: { productId },
        include: {
          group: {
            include: {
              options: {
                orderBy: { sortOrder: 'asc' },
              },
            },
          },
        },
        orderBy: { sortOrder: 'asc' },
      });
    });
  }

  /**
   * Endpoint público consumido pela loja virtual (cliente).
   * Retorna apenas grupos ativos e opções ativas do produto montado.
   */
  async getProductCompositionsForStore(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        storeId: true,
        title: true,
        price: true,
        promotionalPrice: true,
        isCustomizable: true,
        isVisible: true,
      },
    });
    const tenantStoreId = this.tenantContextService.getStoreId();
    if (
      !product ||
      !product.isVisible ||
      !product.storeId ||
      (tenantStoreId && product.storeId !== tenantStoreId)
    ) {
      throw new NotFoundException('Produto não disponível.');
    }

    const compositions = await this.prisma.productComposition.findMany({
      where: {
        productId,
        group: { storeId: product.storeId, isActive: true },
      },
      include: {
        group: {
          include: {
            options: {
              where: { isActive: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    return {
      product,
      stages: compositions.map((pc) => ({
        id: pc.id,
        groupId: pc.group.id,
        name: pc.group.name,
        description: pc.group.description,
        minQuantity:
          pc.customMinQuantity !== null && pc.customMinQuantity !== undefined
            ? pc.customMinQuantity
            : pc.group.minQuantity,
        maxQuantity:
          pc.customMaxQuantity !== null && pc.customMaxQuantity !== undefined
            ? pc.customMaxQuantity
            : pc.group.maxQuantity,
        freeQuantity:
          pc.customFreeQuantity !== null && pc.customFreeQuantity !== undefined
            ? pc.customFreeQuantity
            : pc.group.freeQuantity,
        sortOrder: pc.sortOrder,
        options: pc.group.options.map((opt) => ({
          id: opt.id,
          name: opt.name,
          description: opt.description,
          imageUrl: opt.imageUrl,
          price: Number(opt.price),
          maxQuantityPerItem: opt.maxQuantityPerItem,
          sortOrder: opt.sortOrder,
        })),
      })),
    };
  }
}
