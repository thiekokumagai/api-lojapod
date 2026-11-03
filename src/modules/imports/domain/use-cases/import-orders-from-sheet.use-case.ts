import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';
import * as XLSX from 'xlsx';

export interface ImportSheetResult {
  totalProcessed: number;
  imported: number;
  skipped: number;
  errors: Array<{ line: number; message: string }>;
}

interface ImportedOrder {
  sourceId: string;
  customerName: string;
  customerPhone: string;
  itemsTotal: number;
  paymentType: string;
  paymentMethod: string;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
  complement: string;
  observation: string;
  createdAt: Date;
}

const normalize = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');

@Injectable()
export class ImportOrdersFromSheetUseCase {
  private readonly logger = new Logger(ImportOrdersFromSheetUseCase.name);

  constructor(private readonly prisma: PrismaService) {}

  private getColumn(row: Record<string, unknown>, ...names: string[]): unknown {
    const normalizedNames = names.map(normalize);
    const entry = Object.entries(row).find(([key]) =>
      normalizedNames.includes(normalize(key)),
    );
    return entry?.[1] ?? '';
  }

  private cleanText(value: unknown): string {
    let text = '';
    if (typeof value === 'string') {
      text = value.trim();
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      text = String(value).trim();
    } else if (value instanceof Date) {
      text = value.toISOString();
    } else if (value !== null && value !== undefined) {
      throw new Error('Valor de célula inválido');
    }

    return /^null$/i.test(text) ? '' : text;
  }

  private parseDate(rawDate: unknown): Date {
    if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
      return rawDate;
    }

    if (typeof rawDate === 'number' && Number.isFinite(rawDate)) {
      const excelEpoch = Date.UTC(1899, 11, 30);
      const parsed = new Date(excelEpoch + rawDate * 24 * 60 * 60 * 1000);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    const value = this.cleanText(rawDate);
    const brazilianDate = value.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );

    if (brazilianDate) {
      const [, day, month, year, hour = '00', minute = '00', second = '00'] =
        brazilianDate;
      const parsed = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
      );

      if (
        parsed.getFullYear() === Number(year) &&
        parsed.getMonth() === Number(month) - 1 &&
        parsed.getDate() === Number(day) &&
        parsed.getHours() === Number(hour) &&
        parsed.getMinutes() === Number(minute) &&
        parsed.getSeconds() === Number(second)
      ) {
        return parsed;
      }
    } else if (value) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) return parsed;
    }

    throw new Error(`Data inválida: "${value || 'vazia'}"`);
  }

  private parseDecimal(value: unknown): number {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number(value.toFixed(2));
    }

    let text = this.cleanText(value)
      .replace(/^R\$\s*/i, '')
      .replace(/\s/g, '');
    if (text.includes(',') && text.includes('.')) {
      text = text.replace(/\./g, '').replace(',', '.');
    } else if (text.includes(',')) {
      text = text.replace(',', '.');
    }

    const amount = Number(text);
    if (!text || !Number.isFinite(amount) || amount < 0) {
      throw new Error(`Total inválido: "${this.cleanText(value) || 'vazio'}"`);
    }

    return Number(amount.toFixed(2));
  }

  private parsePaymentMethod(value: string): {
    paymentType: string;
    paymentMethod: string;
  } {
    const payment = normalize(value);

    if (payment === 'pix') {
      return { paymentType: 'Online', paymentMethod: 'pix' };
    }
    if (payment.includes('credito')) {
      return { paymentType: 'Presencial', paymentMethod: 'credit' };
    }
    if (payment.includes('debito')) {
      return { paymentType: 'Presencial', paymentMethod: 'debit' };
    }
    if (payment.includes('dinheiro') || payment === 'cash') {
      return { paymentType: 'Presencial', paymentMethod: 'cash' };
    }
    if (payment.includes('valealimentacao') || payment === 'foodvoucher') {
      return { paymentType: 'Presencial', paymentMethod: 'food_voucher' };
    }
    if (payment.includes('valerefeicao') || payment === 'mealvoucher') {
      return { paymentType: 'Presencial', paymentMethod: 'meal_voucher' };
    }

    throw new Error(
      `Forma de pagamento não reconhecida: "${value || 'vazia'}"`,
    );
  }

  private mapRow(row: Record<string, unknown>): ImportedOrder {
    const customerName = this.cleanText(this.getColumn(row, 'nome', 'cliente'));
    const customerPhone = this.cleanText(
      this.getColumn(row, 'whatsapp', 'telefone', 'celular', 'fone'),
    );
    const paymentValue = this.cleanText(
      this.getColumn(row, 'pagamento', 'forma_pagamento', 'forma_pagto'),
    );
    const { paymentType, paymentMethod } =
      this.parsePaymentMethod(paymentValue);

    return {
      sourceId: this.cleanText(
        this.getColumn(
          row,
          'num_pedido',
          'num_pedi',
          'numero_pedido',
          'id_pedido',
        ),
      ),
      customerName: customerName || 'Cliente Importado',
      customerPhone,
      itemsTotal: this.parseDecimal(
        this.getColumn(row, 'total', 'valor_total', 'valor'),
      ),
      paymentType,
      paymentMethod,
      street: this.cleanText(
        this.getColumn(row, 'endereco', 'rua', 'logradouro'),
      ),
      number:
        this.cleanText(
          this.getColumn(row, 'numero', 'num_endereco', 'numero_endereco'),
        ) || 'S/N',
      neighborhood: this.cleanText(this.getColumn(row, 'bairro')),
      city: this.cleanText(this.getColumn(row, 'cidade')),
      state: this.cleanText(this.getColumn(row, 'estado', 'uf')),
      cep: this.cleanText(this.getColumn(row, 'cep')),
      complement: this.cleanText(
        this.getColumn(row, 'referencia', 'complemento'),
      ),
      observation: this.cleanText(this.getColumn(row, 'observacao', 'obs')),
      createdAt: this.parseDate(
        this.getColumn(row, 'data', 'data_pedido', 'criado_em'),
      ),
    };
  }

  async execute(
    fileBuffer: Buffer,
    storeId: string,
  ): Promise<ImportSheetResult> {
    this.logger.log(`Iniciando importação de planilha para a loja: ${storeId}`);

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error('Nenhuma planilha encontrada no arquivo enviado.');
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[sheetName],
      { defval: '', raw: false },
    );

    if (rows.length === 0) {
      return { totalProcessed: 0, imported: 0, skipped: 0, errors: [] };
    }

    let imported = 0;
    let skipped = 0;
    const errors: ImportSheetResult['errors'] = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      const line = index + 2;

      try {
        const order = this.mapRow(row);
        const customer = order.customerPhone
          ? await this.prisma.customer.upsert({
              where: {
                storeId_phone: {
                  storeId,
                  phone: order.customerPhone,
                },
              },
              update: { name: order.customerName },
              create: {
                storeId,
                phone: order.customerPhone,
                name: order.customerName,
              },
            })
          : null;

        if (customer && order.street) {
          const existingAddress = await this.prisma.customerAddress.findFirst({
            where: {
              customerId: customer.id,
              street: order.street,
              number: order.number,
            },
          });

          if (!existingAddress) {
            await this.prisma.customerAddress.create({
              data: {
                storeId,
                customerId: customer.id,
                street: order.street,
                number: order.number,
                neighborhood: order.neighborhood,
                city: order.city,
                state: order.state,
                cep: order.cep,
                complement: order.complement,
                isDefault: true,
              },
            });
          }
        }

        const orderData = {
          customerId: customer?.id ?? null,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          itemsTotal: order.itemsTotal,
          freight: 0,
          totalOrder: order.itemsTotal,
          totalReceived: order.itemsTotal,
          paymentType: order.paymentType,
          paymentMethod: order.paymentMethod,
          street: order.street,
          number: order.number,
          neighborhood: order.neighborhood,
          city: order.city,
          state: order.state,
          cep: order.cep,
          complement: order.complement,
          observation: order.observation,
          deliveryModality: 'DELIVERY',
          cardFee: 0,
          isPrinted: true,
          status: 'COMPLETED' as const,
          paymentStatus: 'PAID' as const,
          createdAt: order.createdAt,
          paymentDate: order.createdAt,
        };

        const externalId = order.sourceId
          ? `sheet:${storeId}:${order.sourceId}`
          : null;

        if (externalId) {
          await this.prisma.order.upsert({
            where: { externalId },
            update: { ...orderData, storeId },
            create: { ...orderData, externalId, storeId },
          });
        } else {
          await this.prisma.order.create({
            data: { ...orderData, storeId },
          });
        }

        imported++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Erro ao processar linha';
        this.logger.error(`Erro ao importar linha ${line}: ${message}`);
        errors.push({ line, message });
        skipped++;
      }
    }

    this.logger.log(
      `Importação concluída: ${imported} importados, ${skipped} ignorados.`,
    );

    return {
      totalProcessed: rows.length,
      imported,
      skipped,
      errors,
    };
  }
}
