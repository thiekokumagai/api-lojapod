import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import {
  Order,
  OrderStatus,
  PaymentStatus,
  OrderItem,
} from '../../domain/entities/order.entity';
import {
  IOrdersRepository,
  OrderFilters,
  PaginatedOrders,
} from '../../domain/repositories/iorders.repository';

@Injectable()
export class PrismaOrdersRepository implements IOrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDomain(record: any): Order {
    return new Order({
      id: record.id,
      orderNumber: record.orderNumber,
      customerId: record.customerId,
      customerName: record.customerName,
      customerPhone: record.customerPhone,
      itemsTotal: Number(record.itemsTotal),
      freight: Number(record.freight),
      paymentDiscount: Number(record.paymentDiscount || 0),
      installmentSurcharge: Number(record.installmentSurcharge || 0),
      couponDiscount: Number(record.couponDiscount || 0),
      couponFreightDiscount: Number(record.couponFreightDiscount || 0),
      receiptDiscount: Number(record.receiptDiscount || 0),
      receiptSurcharge: Number(record.receiptSurcharge || 0),
      amountProvided: record.amountProvided ? Number(record.amountProvided) : null,
      changeAmount: record.changeAmount ? Number(record.changeAmount) : null,

      totalOrder: Number(record.totalOrder),
      totalReceived: Number(record.totalReceived),
      cardFee: Number(record.cardFee || 0),
      paymentType: record.paymentType,
      paymentMethod: record.paymentMethod,
      pixKey: record.pixKey,
      street: record.street,
      number: record.number,
      neighborhood: record.neighborhood,
      city: record.city,
      state: record.state,
      cep: record.cep,
      complement: record.complement,
      observation: record.observation,
      couponId: record.couponId,
      coupon: record.coupon
        ? {
            title: record.coupon.title,
            type: record.coupon.type,
          }
        : null,
      courierTransactionId: record.courierTransactionId,
      courier: record.courierTransaction?.courier
        ? {
            id: record.courierTransaction.courier.id,
            name: record.courierTransaction.courier.name,
          }
        : null,
      status: record.status as OrderStatus,
      paymentStatus: record.paymentStatus as PaymentStatus,
      installments: record.installments,
      paymentDate: record.paymentDate,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      isPrinted: record.isPrinted,
      items:
        record.items?.map((item: any) => {
          let imageUrl = undefined;
          if (item.product?.images?.length > 0) {
            const mainImage =
              item.product.images.find((img: any) => img.isMain) ||
              item.product.images[0];
            imageUrl = mainImage.url;
          }
          return {
            id: item.id,
            orderId: item.orderId,
            productId: item.productId,
            productItemId: item.productItemId || null,
            productName: item.productName,
            price: Number(item.price),
            quantity: item.quantity,
            variation: item.variation || null,
            imageUrl,
            costPrice: item.product?.costPrice ? Number(item.product.costPrice) : 0,
          };
        }) ?? [],
    });
  }

  async findMany(filters: OrderFilters): Promise<PaginatedOrders> {
    const where: any = {};

    if (filters.search) {
      where.OR = [
        { customerName: { contains: filters.search, mode: 'insensitive' } },
        { customerPhone: { contains: filters.search, mode: 'insensitive' } },
      ];
      
      const cleanSearch = filters.search.replace(/\D/g, '');
      if (cleanSearch.length > 0) {
        where.OR.push({ customerPhone: { contains: cleanSearch, mode: 'insensitive' } });
        
        if (cleanSearch.length === 11) {
          const ddd = cleanSearch.substring(0, 2);
          const p1 = cleanSearch.substring(2, 7);
          const p2 = cleanSearch.substring(7);
          
          where.OR.push({ customerPhone: { contains: `(${ddd}) ${p1}-${p2}`, mode: 'insensitive' } });
          where.OR.push({ customerPhone: { contains: `(${ddd})${p1}-${p2}`, mode: 'insensitive' } });
          where.OR.push({ customerPhone: { contains: `(${ddd}) ${p1}${p2}`, mode: 'insensitive' } });
          where.OR.push({ customerPhone: { contains: `${ddd} ${p1}-${p2}`, mode: 'insensitive' } });
          where.OR.push({ customerPhone: { contains: `(${ddd}) ${p1.substring(0,1)} ${p1.substring(1)}-${p2}`, mode: 'insensitive' } });
        } else if (cleanSearch.length === 10) {
          const ddd = cleanSearch.substring(0, 2);
          const p1 = cleanSearch.substring(2, 6);
          const p2 = cleanSearch.substring(6);
          
          where.OR.push({ customerPhone: { contains: `(${ddd}) ${p1}-${p2}`, mode: 'insensitive' } });
          where.OR.push({ customerPhone: { contains: `(${ddd})${p1}-${p2}`, mode: 'insensitive' } });
          where.OR.push({ customerPhone: { contains: `(${ddd}) ${p1}${p2}`, mode: 'insensitive' } });
        } else {
          let f1 = cleanSearch;
          if (cleanSearch.length >= 2) f1 = '(' + cleanSearch.substring(0, 2) + (cleanSearch.length > 2 ? ') ' + cleanSearch.substring(2) : '');
          if (cleanSearch.length >= 7) f1 = f1.substring(0, 10) + '-' + f1.substring(10);
          where.OR.push({ customerPhone: { contains: f1, mode: 'insensitive' } });
        }
      }

      // Check if filters.search looks like an order number
      const numSearch = Number(cleanSearch);
      if (!isNaN(numSearch) && numSearch > 0) {
        where.OR.push({ orderNumber: numSearch });
      }
    }

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    // Default pagination params
    const page = filters.page ? Math.max(1, Number(filters.page)) : 1;
    const limit = filters.limit ? Math.max(1, Number(filters.limit)) : 10;
    const skip = (page - 1) * limit;

    const total = await this.prisma.order.count({ where });

    const records = await this.prisma.order.findMany({
      where,
      include: {
        coupon: true,
        courierTransaction: {
          include: {
            courier: true,
          }
        },
        items: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    return {
      data: records.map((record) => this.mapToDomain(record)),
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  async findPaidOrdersByPaymentDateRange(
    startDate: Date,
    endDate: Date,
  ): Promise<Order[]> {
    const records = await this.prisma.order.findMany({
      where: {
        paymentStatus: 'PAID',
        paymentDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        items: {
          include: {
            product: true,
          }
        },
      },
      orderBy: {
        paymentDate: 'desc',
      },
    });
    return records.map((record) => this.mapToDomain(record));
  }

  async findById(id: string): Promise<Order | null> {
    const record = await this.prisma.order.findUnique({
      where: { id },
      include: {
        coupon: true,
        courierTransaction: {
          include: {
            courier: true,
          }
        },
        items: {
          include: {
            product: {
              include: {
                images: true,
              },
            },
          },
        },
      },
    });

    if (!record) return null;
    return this.mapToDomain(record);
  }

  async updateStatus(id: string, status: OrderStatus): Promise<void> {
    await this.prisma.order.update({
      where: { id },
      data: { status },
    });
  }

  async save(order: Order): Promise<Order> {
    const payload = {
      customerId: order.customerId,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      itemsTotal: order.itemsTotal,
      freight: order.freight,
      paymentDiscount: order.paymentDiscount,
      installmentSurcharge: order.installmentSurcharge,
      couponDiscount: order.couponDiscount,
      couponFreightDiscount: order.couponFreightDiscount,
      receiptDiscount: order.receiptDiscount,
      receiptSurcharge: order.receiptSurcharge,
      amountProvided: order.amountProvided,
      changeAmount: order.changeAmount,

      totalOrder: order.totalOrder,
      totalReceived: order.totalReceived,
      paymentType: order.paymentType,
      paymentMethod: order.paymentMethod,
      pixKey: order.pixKey,
      street: order.street,
      number: order.number,
      neighborhood: order.neighborhood,
      city: order.city,
      state: order.state,
      cep: order.cep,
      complement: order.complement,
      observation: order.observation,
      status: order.status,
      paymentStatus: order.paymentStatus,
      installments: order.installments,
      paymentDate: order.paymentDate,
      cardFee: order.cardFee,
      couponId: order.couponId || undefined,
      isPrinted: order.isPrinted || false,
    };

    let record;
    if (order.id) {
      record = await this.prisma.order.update({
        where: { id: order.id },
        data: payload,
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                },
              },
            },
          },
        },
      });
    } else {
      record = await this.prisma.order.create({
        data: {
          ...payload,
          items: {
            create:
              order.items?.map((item) => ({
                productId: item.productId,
                productItemId: item.productItemId,
                productName: item.productName,
                price: item.price,
                quantity: item.quantity,
                variation: item.variation,
              })) ?? [],
          },
        } as any,
        include: {
          items: {
            include: {
              product: {
                include: {
                  images: true,
                },
              },
            },
          },
        },
      });
    }

    return this.mapToDomain(record);
  }

  private async findProductItem(
    tx: any,
    productId: string,
    productItemId?: string | null,
    variation?: string | null,
    requiredQuantity: number = 1,
  ): Promise<any> {
    if (productItemId) {
      const item = await tx.productItem.findUnique({
        where: { id: productItemId },
        include: {
          options: {
            include: {
              option: true,
            },
          },
        },
      });
      if (item) return item;
    }

    const allItems = await tx.productItem.findMany({
      where: { productId },
      include: {
        options: {
          include: {
            option: true,
          },
        },
      },
    });

    if (allItems.length === 0) return null;

    if (variation && variation.trim() !== '') {
      const targetVar = variation.trim().toLowerCase();
      const match = allItems.find((pi: any) => {
        const optValues = pi.options.map((o: any) => o.option.value.trim().toLowerCase());
        const joinedLabel = optValues.join(' - ');
        return (
          joinedLabel === targetVar ||
          optValues.includes(targetVar) ||
          targetVar.includes(joinedLabel)
        );
      });
      if (match) return match;
    }

    const itemWithStock = allItems.find((pi: any) => pi.stock >= requiredQuantity);
    if (itemWithStock) return itemWithStock;

    return [...allItems].sort((a: any, b: any) => b.stock - a.stock)[0];
  }

  async saveWithStockDecrement(order: Order): Promise<Order> {
    const record = await this.prisma.$transaction(async (tx) => {
      const createdStockMovementIds: string[] = [];
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (!item.productId) {
            throw new Error(
              `Item productName ${item.productName} must be linked to a productId`,
            );
          }

          const productItem = await this.findProductItem(
            tx,
            item.productId,
            item.productItemId,
            item.variation,
            item.quantity,
          );

          if (!productItem) {
            throw new Error(
              `Estoque do produto ou variação de "${item.productName}" não cadastrado.`,
            );
          }

          if (productItem.stock < item.quantity) {
            throw new Error(
              `Estoque insuficiente para o item "${item.productName}". Disponível: ${productItem.stock}, Solicitado: ${item.quantity}`,
            );
          }

          await tx.productItem.update({
            where: { id: productItem.id },
            data: {
              stock: {
                decrement: item.quantity,
              },
            },
          });

          const sm = await tx.stockMovement.create({
            data: {
              type: 'SUBTRACT',
              quantity: item.quantity,
              previousStock: productItem.stock,
              newStock: productItem.stock - item.quantity,
              observation: `Venda via pedido`,
              productId: item.productId,
              productItemId: productItem.id,
            },
          });
          createdStockMovementIds.push(sm.id);

          // Check if total stock for this product is 0 or less, if so disable it
          const allItems = await tx.productItem.findMany({
            where: { productId: item.productId },
          });
          const totalStock = allItems.reduce((acc, curr) => acc + curr.stock, 0);
          if (totalStock <= 0) {
            await tx.product.update({
              where: { id: item.productId },
              data: { isVisible: false },
            });
          }

          item.productItemId = productItem.id;
        }
      }

      let customerIdToLink = order.customerId;

      if (!customerIdToLink && order.customerPhone) {
        let customer = await tx.customer.findUnique({
          where: { phone: order.customerPhone },
        });

        if (!customer) {
          customer = await tx.customer.create({
            data: {
              name: order.customerName,
              phone: order.customerPhone,
            },
          });
        }
        customerIdToLink = customer.id;
      }

      if (customerIdToLink) {
        try {
          await tx.customer.update({
            where: { id: customerIdToLink },
            data: {
              ...(order.customerName ? { name: order.customerName } : {}),
              ...(order.customerPhone ? { phone: order.customerPhone } : {}),
            },
          });
        } catch (err) {
          console.warn('Erro ao atualizar cadastro do cliente ao criar pedido:', err);
        }
      }

      // Validação para cadastrar endereço novo por CEP e número
      if (customerIdToLink && order.cep) {
        const existingAddress = await tx.customerAddress.findFirst({
          where: {
            customerId: customerIdToLink,
            cep: order.cep,
            number: order.number,
          },
        });

        if (!existingAddress) {
          // Remove isDefault dos outros
          await tx.customerAddress.updateMany({
            where: { customerId: customerIdToLink },
            data: { isDefault: false },
          });

          // Cria o novo
          await tx.customerAddress.create({
            data: {
              customerId: customerIdToLink,
              street: order.street,
              number: order.number,
              neighborhood: order.neighborhood,
              city: order.city || '',
              state: order.state || '',
              cep: order.cep || '',
              complement: order.complement || '',
              isDefault: true,
            },
          });
        } else {
          // Atualiza para ser o padrão e atualiza os dados do endereço (rua, bairro, cidade, estado, complemento)
          await tx.customerAddress.updateMany({
            where: { customerId: customerIdToLink },
            data: { isDefault: false },
          });
          await tx.customerAddress.update({
            where: { id: existingAddress.id },
            data: {
              street: order.street,
              number: order.number,
              neighborhood: order.neighborhood,
              city: order.city || '',
              state: order.state || '',
              cep: order.cep || '',
              complement: order.complement || '',
              isDefault: true,
            },
          });
        }
      }

      const payload = {
        customerId: customerIdToLink,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        itemsTotal: order.itemsTotal,
        freight: order.freight,
        paymentDiscount: order.paymentDiscount,
        installmentSurcharge: order.installmentSurcharge,
        couponDiscount: order.couponDiscount,
        couponFreightDiscount: order.couponFreightDiscount,
        receiptDiscount: order.receiptDiscount,
        receiptSurcharge: order.receiptSurcharge,
        amountProvided: order.amountProvided,
        changeAmount: order.changeAmount,

        totalOrder: order.totalOrder,
        totalReceived: order.totalReceived,
        paymentType: order.paymentType,
        paymentMethod: order.paymentMethod,
        pixKey: order.pixKey,
        street: order.street,
        number: order.number,
        neighborhood: order.neighborhood,
        city: order.city,
        state: order.state,
        cep: order.cep,
        complement: order.complement,
        observation: order.observation,
        status: order.status,
        paymentStatus: order.paymentStatus,
        installments: order.installments,
        paymentDate: order.paymentDate,
        cardFee: order.cardFee,
        couponId: order.couponId || undefined,
        courierTransactionId: order.courierTransactionId || undefined,
        isPrinted: order.isPrinted || false,
      };

      const createdOrder = await tx.order.create({
        data: {
          ...payload,
          items: {
            create:
              order.items?.map((item) => ({
                productId: item.productId,
                productItemId: item.productItemId,
                productName: item.productName,
                price: item.price,
                quantity: item.quantity,
                variation: item.variation,
              })) ?? [],
          },
        } as any,
        include: {
          items: true,
        },
      });

      if (createdStockMovementIds.length > 0) {
        await tx.stockMovement.updateMany({
          where: { id: { in: createdStockMovementIds } },
          data: { observation: `Venda via pedido #${createdOrder.orderNumber}` }
        });
      }

      return createdOrder;
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    return this.mapToDomain(record);
  }

  async updateWithStockAdjustment(id: string, order: Order): Promise<Order> {
    const record = await this.prisma.$transaction(async (tx) => {
      const existingOrder = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!existingOrder) throw new Error(`Order with ID ${id} not found`);

      // 1. Restaurar o estoque dos itens antigos
      for (const oldItem of existingOrder.items) {
        if (oldItem.productId) {
          const productItem = await this.findProductItem(
            tx,
            oldItem.productId,
            oldItem.productItemId,
            oldItem.variation,
            oldItem.quantity,
          );

          if (productItem) {
            await tx.productItem.update({
              where: { id: productItem.id },
              data: { stock: { increment: oldItem.quantity } },
            });
            await tx.stockMovement.create({
              data: {
                type: 'ADD',
                quantity: oldItem.quantity,
                previousStock: productItem.stock,
                newStock: productItem.stock + oldItem.quantity,
                observation: `Restaurado por edição do pedido #${existingOrder.orderNumber}`,
                productId: oldItem.productId,
                productItemId: productItem.id,
              },
            });
            await tx.product.update({
              where: { id: oldItem.productId },
              data: { isVisible: true },
            });
          }
        }
      }

      // 2. Deletar itens antigos
      await tx.orderItem.deleteMany({
        where: { orderId: id },
      });

      // 3. Decrementar estoque dos novos itens
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (!item.productId) throw new Error(`Item must be linked to a productId`);

          const productItem = await this.findProductItem(
            tx,
            item.productId,
            item.productItemId,
            item.variation,
            item.quantity,
          );

          if (!productItem) throw new Error(`Estoque do produto "${item.productName}" não cadastrado.`);
          if (productItem.stock < item.quantity) throw new Error(`Estoque insuficiente para "${item.productName}". Disponível: ${productItem.stock}, Solicitado: ${item.quantity}`);

          await tx.productItem.update({
            where: { id: productItem.id },
            data: { stock: { decrement: item.quantity } },
          });

          await tx.stockMovement.create({
            data: {
              type: 'SUBTRACT',
              quantity: item.quantity,
              previousStock: productItem.stock,
              newStock: productItem.stock - item.quantity,
              observation: `Venda via edição do pedido #${existingOrder.orderNumber}`,
              productId: item.productId,
              productItemId: productItem.id,
            },
          });

          const allItems = await tx.productItem.findMany({ where: { productId: item.productId } });
          const totalStock = allItems.reduce((acc, curr) => acc + curr.stock, 0);
          if (totalStock <= 0) {
            await tx.product.update({
              where: { id: item.productId },
              data: { isVisible: false },
            });
          }

          item.productItemId = productItem.id;
        }
      }

      // 4. Atualizar o pedido e criar os novos itens
      const customerIdToLink = existingOrder.customerId || order.customerId;

      if (customerIdToLink) {
        try {
          await tx.customer.update({
            where: { id: customerIdToLink },
            data: {
              ...(order.customerName ? { name: order.customerName } : {}),
              ...(order.customerPhone ? { phone: order.customerPhone } : {}),
            },
          });
        } catch (err) {
          console.warn('Erro ao atualizar cadastro do cliente ao editar pedido:', err);
        }
      }
      const payload = {
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerId: customerIdToLink || undefined,
        itemsTotal: order.itemsTotal,
        freight: order.freight,
        paymentDiscount: order.paymentDiscount,
        installmentSurcharge: order.installmentSurcharge,
        couponDiscount: order.couponDiscount,
        couponFreightDiscount: order.couponFreightDiscount,
        receiptDiscount: order.receiptDiscount,
        receiptSurcharge: order.receiptSurcharge,
        amountProvided: order.amountProvided,
        changeAmount: order.changeAmount,

        totalOrder: order.totalOrder,
        totalReceived: order.totalReceived,
        paymentType: order.paymentType,
        paymentMethod: order.paymentMethod,
        pixKey: order.pixKey,
        street: order.street,
        number: order.number,
        neighborhood: order.neighborhood,
        city: order.city,
        state: order.state,
        cep: order.cep,
        complement: order.complement,
        observation: order.observation,
        status: order.status,
        paymentStatus: order.paymentStatus,
        installments: order.installments,
        paymentDate: order.paymentDate,
        cardFee: order.cardFee,
        couponId: order.couponId || undefined,
        courierTransactionId: order.courierTransactionId || undefined,
        isPrinted: order.isPrinted || false,
      };

      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          ...payload,
          items: {
            create: order.items?.map(item => ({
              productId: item.productId,
              productItemId: item.productItemId,
              productName: item.productName,
              price: item.price,
              quantity: item.quantity,
              variation: item.variation,
            })) ?? []
          }
        },
        include: { items: true },
      });

      if (customerIdToLink && order.cep) {
        const existingAddress = await tx.customerAddress.findFirst({
          where: {
            customerId: customerIdToLink,
            cep: order.cep,
            number: order.number,
          },
        });

        if (!existingAddress) {
          await tx.customerAddress.updateMany({
            where: { customerId: customerIdToLink },
            data: { isDefault: false },
          });
          await tx.customerAddress.create({
            data: {
              customerId: customerIdToLink,
              street: order.street,
              number: order.number,
              neighborhood: order.neighborhood,
              city: order.city || '',
              state: order.state || '',
              cep: order.cep || '',
              complement: order.complement || '',
              isDefault: true,
            },
          });
        } else {
          await tx.customerAddress.updateMany({
            where: { customerId: customerIdToLink },
            data: { isDefault: false },
          });
          await tx.customerAddress.update({
            where: { id: existingAddress.id },
            data: {
              street: order.street,
              number: order.number,
              neighborhood: order.neighborhood,
              city: order.city || '',
              state: order.state || '',
              cep: order.cep || '',
              complement: order.complement || '',
              isDefault: true,
            },
          });
        }
      }

      return updatedOrder;
    }, { maxWait: 15000, timeout: 30000 });

    return this.mapToDomain(record);
  }

  async cancelAndRestoreStock(id: string): Promise<Order> {
    const record = await this.prisma.$transaction(async (tx) => {
      const orderRecord = await tx.order.findUnique({
        where: { id },
        include: {
          items: true,
        },
      });

      if (!orderRecord) {
        throw new Error(`Order with ID ${id} not found`);
      }

      if (orderRecord.status === 'CANCELLED') {
        throw new Error('Order is already cancelled');
      }

      if (orderRecord.status === 'COMPLETED') {
        throw new Error('Cannot cancel a completed order');
      }

      for (const item of orderRecord.items) {
        if (item.productId) {
          let productItem: any;
          if (item.productItemId) {
            productItem = await tx.productItem.findUnique({ where: { id: item.productItemId } });
          } else {
            productItem = await tx.productItem.findFirst({ where: { productId: item.productId } });
          }

          if (productItem) {
            await tx.productItem.update({
              where: { id: productItem.id },
              data: {
                stock: {
                  increment: item.quantity,
                },
              },
            });

            await tx.stockMovement.create({
              data: {
                type: 'ADD',
                quantity: item.quantity,
                previousStock: productItem.stock,
                newStock: productItem.stock + item.quantity,
                observation: `Cancelamento do pedido #${orderRecord.orderNumber}`,
                productId: item.productId,
                productItemId: productItem.id,
              },
            });

            await tx.product.update({
              where: { id: item.productId },
              data: { isVisible: true },
            });
          }
        }
      }

      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status: 'CANCELLED',
        },
        include: {
          items: true,
        },
      });

      return updatedOrder;
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    return this.mapToDomain(record);
  }

  async recoverAndDecrementStock(id: string, newStatus: OrderStatus): Promise<Order> {
    const record = await this.prisma.$transaction(async (tx) => {
      const orderRecord = await tx.order.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!orderRecord) {
        throw new Error(`Order with ID ${id} not found`);
      }

      if (orderRecord.status !== 'CANCELLED') {
        throw new Error('Order is not cancelled, cannot recover');
      }

      for (const item of orderRecord.items) {
        if (item.productId) {
          let productItem: any;
          if (item.productItemId) {
            productItem = await tx.productItem.findUnique({ where: { id: item.productItemId } });
          } else {
            productItem = await tx.productItem.findFirst({ where: { productId: item.productId } });
          }

          if (productItem) {
            if (productItem.stock < item.quantity) {
               throw new Error(`Estoque insuficiente para recuperação do produto ID ${item.productId}. Disponível: ${productItem.stock}, Solicitado: ${item.quantity}`);
            }

            await tx.productItem.update({
              where: { id: productItem.id },
              data: {
                stock: {
                  decrement: item.quantity,
                },
              },
            });

            await tx.stockMovement.create({
              data: {
                type: 'SUBTRACT',
                quantity: item.quantity,
                previousStock: productItem.stock,
                newStock: productItem.stock - item.quantity,
                observation: `Recuperação do pedido #${orderRecord.orderNumber}`,
                productId: item.productId,
                productItemId: productItem.id,
              },
            });

            const allItems = await tx.productItem.findMany({ where: { productId: item.productId } });
            const totalStock = allItems.reduce((acc, curr) => acc + curr.stock, 0);
            if (totalStock <= item.quantity) { // We use item.quantity because we already decremented the productItem stock in DB, but allItems gets the updated stock in transaction? Wait, the previous line already decremented stock in the DB. So totalStock will ALREADY include the decrement. So if totalStock <= 0, deactivate.
              // Let's re-calculate: wait, in a transaction, the next query `findMany` will see the updated value!
              // So totalStock <= 0 is correct.
            }
            
            // Wait, to be safe, let's just query again and check <= 0.
            const updatedAllItems = await tx.productItem.findMany({ where: { productId: item.productId } });
            const currentTotalStock = updatedAllItems.reduce((acc, curr) => acc + curr.stock, 0);
            if (currentTotalStock <= 0) {
              await tx.product.update({
                where: { id: item.productId },
                data: { isVisible: false },
              });
            } else {
              // Optionally set visible to true if we just recovered it and it had stock
              await tx.product.update({
                where: { id: item.productId },
                data: { isVisible: true },
              });
            }
          }
        }
      }

      const updatedOrder = await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
        },
        include: {
          items: true,
        },
      });

      return updatedOrder;
    }, {
      maxWait: 15000,
      timeout: 30000,
    });

    return this.mapToDomain(record);
  }
}
