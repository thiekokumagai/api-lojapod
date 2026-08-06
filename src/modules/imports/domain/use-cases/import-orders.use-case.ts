/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { Injectable, Logger } from '@nestjs/common';
import { VendizapService } from '../../infrastructure/services/vendizap.service';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ImportOrdersUseCase {
  private readonly logger = new Logger(ImportOrdersUseCase.name);

  constructor(
    private readonly vendizapService: VendizapService,
    private readonly prisma: PrismaService,
  ) {}

  private formatDateForVendizap(date: Date) {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  async execute() {
    this.logger.log('Starting orders import from Vendizap (Month by Month)');

    // Puxa as regras de pagamento para calcular cardFee na importação
    const settings = await this.prisma.storeSettings.findFirst();
    const rules = settings && Array.isArray(settings.paymentRules) ? settings.paymentRules : [];

    const now = new Date();
    let currentDate = new Date(now.getFullYear(), now.getMonth(), 1); // Start at the current month
    //const stopDate = new Date(2023, 9, 1); // Stop at Oct 1, 2023
    //const stopDate = new Date(2026, 4, 1);
    const stopDate = new Date(2023, 11, 1);
    while (currentDate >= stopDate) {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      const startOfMonth = new Date(year, month, 1, 0, 0, 0);
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59);

      const periodEnd = endOfMonth > now ? now : endOfMonth;

      const dataInicial = this.formatDateForVendizap(startOfMonth);
      const dataFinal = this.formatDateForVendizap(periodEnd);

      this.logger.log(`Fetching orders from ${dataInicial} to ${dataFinal}`);

      let skip = 0;
      let hasMore = true;
      const limit = 50;

      while (hasMore) {
        try {
          const data = await this.vendizapService.getOrders({
            tipoData: 'criacao',
            dataInicial,
            dataFinal,
            cancelados: false,
            somenteNovos: false,
            skip,
            limit
          });

          const orders = Array.isArray(data) ? data : data.data || [];

          if (orders.length === 0) {
            hasMore = false;
            break;
          }

          for (const item of orders) {
            try {
              // 1. Customer upsert
              const clienteData = item.cliente || {};
              const customerPhone = clienteData.telefone || item.customer_phone || item.telefone || `NO-PHONE-${item.id}`;
              const customerName = clienteData.nome || item.customer_name || item.nome || 'Imported Customer';
              
              const customer = await this.prisma.customer.upsert({
                where: { phone: customerPhone },
                update: { name: customerName },
                create: {
                  phone: customerPhone,
                  name: customerName,
                },
              });

              // 2. CustomerAddress upsert
              const enderecoData = clienteData.endereco || item.costumer_adress || item.customer_address || {};
              const street = String(enderecoData.logradouro || enderecoData.rua || enderecoData.street || item.street || item.rua || '');
              const number = String(enderecoData.numero || enderecoData.number || item.number || item.numero || '');
              const neighborhood = String(enderecoData.bairro || enderecoData.neighborhood || item.neighborhood || item.bairro || '');
              const city = String(enderecoData.cidade || enderecoData.city || item.city || item.cidade || '');
              const state = String(enderecoData.estado || enderecoData.state || item.state || item.estado || '');
              const cep = String(enderecoData.cep || item.cep || '');
              const complement = String(enderecoData.complemento || enderecoData.complement || item.complement || item.complemento || '');

              if (street) {
                // Try to find if customer already has this address
                let address = await this.prisma.customerAddress.findFirst({
                  where: { customerId: customer.id, street, number, cep }
                });

                if (!address) {
                  address = await this.prisma.customerAddress.create({
                    data: {
                      customerId: customer.id,
                      street,
                      number,
                      neighborhood,
                      city,
                      state,
                      cep,
                      complement,
                      isDefault: true
                    }
                  });
                }
              }

              // 3. Upsert order
              let createdAtDate: Date | undefined = undefined;
              const rawDate = item.data || item.dt_criacao || item.created_at;
              if (rawDate) {
                const parts = rawDate.split(' ');
                const datePart = parts[0];
                if (datePart) {
                   if (datePart.includes('/')) {
                     const [day, month, year] = datePart.split('/');
                     const time = parts[1] || '00:00:00';
                     const [hour, minute, second] = time.split(':');
                     const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
                     if (!isNaN(parsed.getTime())) {
                       createdAtDate = parsed;
                     }
                   } else if (datePart.includes('-')) {
                     // 2024-01-06 format
                     const [year, month, day] = datePart.split('-');
                     const time = parts[1] || '00:00:00';
                     const [hour, minute, second] = time.split(':');
                     const parsed = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
                     if (!isNaN(parsed.getTime())) {
                       createdAtDate = parsed;
                     }
                   }
                }
              }

              const taxaEntrega = item.taxaEntrega || item.freight || item.frete || 0;
              const valorPedido = item.valorPedido || item.total || 0;
              const subtotal = valorPedido - taxaEntrega;
              const valorFinal = item.pagamento?.valores?.valorFinal || valorPedido;
              const desconto = item.taxaAplicada?.valorDesconto 
                || item.pagamento?.taxaAplicada?.valorDesconto 
                || item.logPagamento?.[0]?.taxaAplicada?.valorDesconto 
                || item.pagamento?.valores?.desconto 
                || 0;
              let paymentMethodStr = item.pagamento?.descricao || item.payment_method || item.forma_pagamento || 'PIX';
              if (paymentMethodStr.toUpperCase().includes('PIX')) paymentMethodStr = 'pix';
              else if (paymentMethodStr.toUpperCase().includes('CRÉDITO') || paymentMethodStr.toUpperCase().includes('CREDITO')) paymentMethodStr = 'credit';
              else if (paymentMethodStr.toUpperCase().includes('DÉBITO') || paymentMethodStr.toUpperCase().includes('DEBITO')) paymentMethodStr = 'debit';
              else if (paymentMethodStr.toUpperCase().includes('DINHEIRO')) paymentMethodStr = 'cash';
              const paymentTypeStr = paymentMethodStr === 'pix' ? 'online' : 'entrega';
              const parcelas = Number(item.parcelas || item.pagamento?.parcelas || 1);

              let cardFee = 0;
              let matchingRule: any = null;
              if (paymentMethodStr === 'credit') {
                matchingRule = rules.find((r: any) =>
                  r.paymentMethod === 'credit' && r.type === 'charge' &&
                  parcelas >= (r.parcelaMin || 0) && parcelas <= (r.parcelaMax || 99)
                );
              } else {
                matchingRule = rules.find((r: any) =>
                  r.paymentMethod === paymentMethodStr && r.type === 'charge'
                );
              }

              if (matchingRule && typeof matchingRule.value === 'number') {
                const rawFee = valorFinal * (matchingRule.value / 100);
                cardFee = Math.round(rawFee * 100) / 100;
              }

              const order = await this.prisma.order.upsert({
                where: { externalId: item.id.toString() },
                update: {
                  status: 'COMPLETED',
                  itemsTotal: subtotal,
                  freight: taxaEntrega,
                  totalOrder: valorPedido,
                  totalReceived: valorFinal,
                  paymentDiscount: desconto,
                  paymentType: paymentTypeStr,
                  paymentMethod: paymentMethodStr,
                  cardFee: cardFee,
                  street,
                  number,
                  neighborhood,
                  city,
                  state,
                  cep,
                  complement,
                  isPrinted: true,
                  installments: parcelas,
                  ...(createdAtDate ? { createdAt: createdAtDate, paymentDate: createdAtDate } : {}),
                },
                create: {
                  externalId: item.id.toString(),
                  customerId: customer.id,
                  customerName: customer.name,
                  customerPhone: customer.phone,
                  itemsTotal: subtotal,
                  freight: taxaEntrega,
                  totalOrder: valorPedido,
                  totalReceived: valorFinal,
                  paymentDiscount: desconto,
                  paymentType: paymentTypeStr,
                  paymentMethod: paymentMethodStr,
                  cardFee: cardFee,
                  street,
                  number,
                  neighborhood,
                  city,
                  state,
                  cep,
                  complement,
                  status: 'COMPLETED',
                  paymentStatus: 'PAID',
                  isPrinted: true,
                  installments: parcelas,
                  ...(createdAtDate ? { createdAt: createdAtDate, paymentDate: createdAtDate } : {}),
                },
              });

              // 4. Order Items
              const itensList = item.itens || item.items || [];
              if (itensList.length > 0) {
                // Clear existing items for this order if any to replace with updated list
                await this.prisma.orderItem.deleteMany({
                  where: { orderId: order.id }
                });

                for (const orderItem of itensList) {
                  const itemExternalId = orderItem.id_produto || orderItem.product_id;
                  let productId: string | null = null;
                  let productItemId: string | null = null;

                  if (itemExternalId) {
                    const product = await this.prisma.product.findUnique({
                      where: { externalId: itemExternalId.toString() }
                    });
                    if (product) {
                      productId = product.id;
                    }
                  }

                  let variationName = orderItem.variacao || orderItem.variation || null;
                  if (!variationName && orderItem.relacaoVariacao && orderItem.relacaoVariacao.length > 0) {
                    const vars = orderItem.relacaoVariacao[0].variaveis;
                    if (vars && vars.length > 0) {
                      variationName = vars[0].nome;
                    }
                  }

                  if (productId && variationName) {
                    const pItem = await this.prisma.productItem.findFirst({
                      where: {
                        productId: productId,
                        options: {
                          some: {
                            option: {
                              value: variationName
                            }
                          }
                        }
                      }
                    });
                    if (pItem) {
                      productItemId = pItem.id;
                    }
                  }

                  await this.prisma.orderItem.create({
                    data: {
                      orderId: order.id,
                      productId: productId,
                      productItemId: productItemId,
                      productName: orderItem.descricao || orderItem.nome || orderItem.name || 'Produto Importado',
                      price: orderItem.preco || orderItem.price || 0,
                      quantity: orderItem.quantidade || orderItem.quantity || 1,
                      variation: variationName
                    }
                  });
                }
              }

            } catch (error) {
              this.logger.error(`Failed to process order ${item.id}`, error);
            }
          }

          skip += limit;
          if (orders.length < limit) {
            hasMore = false;
          }
        } catch (error) {
          this.logger.error(`Error fetching orders for period ${dataInicial} - ${dataFinal}`, error.message);
          hasMore = false;
        }
      }

      currentDate = new Date(year, month - 1, 1); // Go backwards one month
    }

    this.logger.log('Finished orders import');
  }
}
