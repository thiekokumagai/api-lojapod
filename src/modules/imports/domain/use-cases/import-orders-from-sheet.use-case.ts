import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import * as XLSX from 'xlsx';

export interface ImportSheetResult {
  totalProcessed: number;
  imported: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
}

@Injectable()
export class ImportOrdersFromSheetUseCase {
  private readonly logger = new Logger(ImportOrdersFromSheetUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  private parseDate(rawDate: any): Date {
    if (!rawDate) return new Date();

    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      return rawDate;
    }

    if (typeof rawDate === 'number') {
      // Excel serial date format
      const parsedDate = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
      if (!isNaN(parsedDate.getTime())) return parsedDate;
    }

    const str = String(rawDate).trim();
    if (!str) return new Date();

    const parts = str.split(' ');
    const datePart = parts[0];
    const timePart = parts[1] || '12:00:00';

    if (datePart.includes('/')) {
      const [day, month, year] = datePart.split('/');
      const [hour = '00', min = '00', sec = '00'] = timePart.split(':');
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(min),
        Number(sec)
      );
      if (!isNaN(date.getTime())) return date;
    } else if (datePart.includes('-')) {
      const [year, month, day] = datePart.split('-');
      const [hour = '00', min = '00', sec = '00'] = timePart.split(':');
      const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(min),
        Number(sec)
      );
      if (!isNaN(date.getTime())) return date;
    }

    const fallback = new Date(str);
    return isNaN(fallback.getTime()) ? new Date() : fallback;
  }

  private parseDecimal(val: any): number {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return val;
    let s = String(val).trim().replace('R$', '').trim();
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const num = parseFloat(s);
    return isNaN(num) ? 0 : num;
  }

  async execute(fileBuffer: Buffer, storeId: string): Promise<ImportSheetResult> {
    this.logger.log(`Iniciando importação de planilha de pedidos para a loja: ${storeId}`);

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('Nenhuma planilha encontrada no arquivo enviado.');
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, {
      defval: '',
      raw: false,
    });

    if (!rawRows || rawRows.length === 0) {
      return { totalProcessed: 0, imported: 0, skipped: 0, errors: [] };
    }

    let imported = 0;
    let skipped = 0;
    const errors: Array<{ line: number; message: string }> = [];

    // Busca regras de taxa da loja se houver
    const settings = await this.prisma.storeSettings.findUnique({ where: { storeId } });
    const rules = (settings && Array.isArray(settings.paymentRules) ? settings.paymentRules : []) as any[];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const lineNumber = i + 2; // Linha 1 = cabeçalho

      try {
        // Encontrar os nomes das colunas de forma flexível (sem se preocupar com maiúsculas/acentos)
        const getCol = (...names: string[]) => {
          for (const key of Object.keys(row)) {
            const normalizedKey = key.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            for (const name of names) {
              const normalizedName = name.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
              if (normalizedKey === normalizedName || normalizedKey.includes(normalizedName)) {
                return row[key];
              }
            }
          }
          return '';
        };

        const numPedido = String(getCol('num_pedido', 'pedido', 'id', 'numero') || '').trim();
        const nomeCliente = String(getCol('nome', 'cliente') || 'Cliente Importado').trim();
        let whatsapp = String(getCol('whatsapp', 'telefone', 'celular', 'fone') || '').trim();
        const entregaModo = String(getCol('entrega', 'tipo_entrega', 'modalidade') || 'Entregar').trim();
        const endereco = String(getCol('endereco', 'rua', 'logradouro') || '').trim();
        const numero = String(getCol('numero', 'num') || 'S/N').trim();
        const bairro = String(getCol('bairro') || '').trim();
        const cidade = String(getCol('cidade') || '').trim();
        const estado = String(getCol('estado', 'uf') || '').trim();
        const cep = String(getCol('cep') || '').trim();
        const referencia = String(getCol('referencia', 'complemento') || '').trim();
        const formaPagamentoRaw = String(getCol('pagamento', 'forma_pagamento', 'forma pagto') || 'PIX').trim();
        const trocoRaw = getCol('troco');
        const observacao = String(getCol('observacao', 'obs') || '').trim();
        const totalRaw = getCol('total', 'valor_total', 'valor');
        const cupom = String(getCol('cupom') || '').trim();
        const dataRaw = getCol('data', 'data_pedido', 'criado_em');

        const totalOrder = this.parseDecimal(totalRaw);
        if (totalOrder <= 0 && !numPedido) {
          skipped++;
          continue;
        }

        // Normalizar Telefone
        if (!whatsapp) {
          whatsapp = numPedido ? `S-FONE-${numPedido}` : `NO-PHONE-${Date.now()}-${i}`;
        }

        // Criar ou atualizar cliente
        const customer = await this.prisma.customer.upsert({
          where: { storeId_phone: { storeId, phone: whatsapp } },
          update: {
            name: nomeCliente || undefined,
          },
          create: {
            storeId,
            phone: whatsapp,
            name: nomeCliente || 'Cliente Importado',
          },
        });

        // Criar endereço do cliente se houver rua
        if (endereco && endereco !== 'NULL') {
          const existingAddr = await this.prisma.customerAddress.findFirst({
            where: {
              customerId: customer.id,
              street: endereco,
              number: numero,
            },
          });

          if (!existingAddr) {
            await this.prisma.customerAddress.create({
              data: {
                storeId,
                customerId: customer.id,
                street: endereco,
                number: numero,
                neighborhood: bairro !== 'NULL' ? bairro : '',
                city: cidade !== 'NULL' ? cidade : '',
                state: estado !== 'NULL' ? estado : '',
                cep: cep !== 'NULL' ? cep : '',
                complement: referencia !== 'NULL' ? referencia : '',
                isDefault: true,
              },
            });
          }
        }

        // Mapear método de pagamento e cálculo de taxas
        const fpUpper = formaPagamentoRaw.toUpperCase();
        let paymentMethodStr = 'pix';
        let paymentTypeStr = 'Online';

        if (fpUpper.includes('PIX')) {
          paymentMethodStr = 'pix';
          paymentTypeStr = 'Online';
        } else if (fpUpper.includes('CRÉDITO') || fpUpper.includes('CREDITO')) {
          paymentMethodStr = 'credit';
          paymentTypeStr = 'Presencial';
        } else if (fpUpper.includes('DÉBITO') || fpUpper.includes('DEBITO')) {
          paymentMethodStr = 'debit';
          paymentTypeStr = 'Presencial';
        } else if (fpUpper.includes('DINHEIRO') || fpUpper.includes('MONEY')) {
          paymentMethodStr = 'money';
          paymentTypeStr = 'Presencial';
        } else if (fpUpper.includes('VALE') || fpUpper.includes('ALIMENTA')) {
          paymentMethodStr = 'voucher';
          paymentTypeStr = 'Presencial';
        } else {
          paymentMethodStr = formaPagamentoRaw.toLowerCase();
          paymentTypeStr = 'Presencial';
        }

        // Taxas de cartão se houver configurado na loja
        let cardFee = 0;
        const matchingRule = rules.find(
          (r: any) =>
            r.method &&
            (r.method.toLowerCase() === paymentMethodStr ||
              (paymentMethodStr === 'credit' && r.method.toLowerCase().includes('crédito')) ||
              (paymentMethodStr === 'debit' && r.method.toLowerCase().includes('débito')))
        );

        if (matchingRule && matchingRule.feePercentage) {
          const feePercent = Number(matchingRule.feePercentage) || 0;
          cardFee = Number(((totalOrder * feePercent) / 100).toFixed(2));
        }

        const externalId = numPedido ? String(numPedido) : `PLANILHA-${Date.now()}-${i}`;
        const createdAtDate = this.parseDate(dataRaw);
        const changeAmount = trocoRaw ? this.parseDecimal(trocoRaw) : null;
        const deliveryModality = entregaModo.toLowerCase().includes('retir') ? 'STORE_PICKUP' : 'DELIVERY';

        // Upsert do pedido
        await this.prisma.order.upsert({
          where: { externalId },
          update: {
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            itemsTotal: totalOrder,
            freight: 0,
            totalOrder: totalOrder,
            totalReceived: totalOrder,
            paymentType: paymentTypeStr,
            paymentMethod: paymentMethodStr,
            cardFee: cardFee,
            street: endereco !== 'NULL' ? endereco : '',
            number: numero !== 'NULL' ? numero : '',
            neighborhood: bairro !== 'NULL' ? bairro : '',
            city: cidade !== 'NULL' ? cidade : '',
            state: estado !== 'NULL' ? estado : '',
            cep: cep !== 'NULL' ? cep : '',
            complement: referencia !== 'NULL' ? referencia : '',
            observation: observacao !== 'NULL' ? observacao : '',
            changeAmount: changeAmount,
            deliveryModality,
            couponDiscount: cupom ? 0 : 0,
            isPrinted: true,
            status: 'COMPLETED',
            paymentStatus: 'PAID',
            createdAt: createdAtDate,
            paymentDate: createdAtDate,
          },
          create: {
            storeId,
            externalId,
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            itemsTotal: totalOrder,
            freight: 0,
            totalOrder: totalOrder,
            totalReceived: totalOrder,
            paymentType: paymentTypeStr,
            paymentMethod: paymentMethodStr,
            cardFee: cardFee,
            street: endereco !== 'NULL' ? endereco : '',
            number: numero !== 'NULL' ? numero : '',
            neighborhood: bairro !== 'NULL' ? bairro : '',
            city: cidade !== 'NULL' ? cidade : '',
            state: estado !== 'NULL' ? estado : '',
            cep: cep !== 'NULL' ? cep : '',
            complement: referencia !== 'NULL' ? referencia : '',
            observation: observacao !== 'NULL' ? observacao : '',
            changeAmount: changeAmount,
            deliveryModality,
            isPrinted: true,
            status: 'COMPLETED',
            paymentStatus: 'PAID',
            createdAt: createdAtDate,
            paymentDate: createdAtDate,
          },
        });

        imported++;
      } catch (err: any) {
        this.logger.error(`Erro ao importar linha ${lineNumber}: ${err.message}`);
        errors.push({ line: lineNumber, message: err.message || 'Erro ao processar linha' });
      }
    }

    this.logger.log(
      `Importação de planilha concluída: ${imported} importados, ${skipped} ignorados, ${errors.length} erros.`
    );

    return {
      totalProcessed: rawRows.length,
      imported,
      skipped,
      errors,
    };
  }
}
