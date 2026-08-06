import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ImportWpFinanceiroUseCase {
  constructor(private prisma: PrismaService) {}

  async execute(): Promise<any> {
    const response = await fetch('https://podemais.shop/wp-json/api/v1/listar-caixas');
    
    if (!response.ok) {
      throw new Error(`Erro ao acessar API: ${response.status} ${response.statusText}`);
    }
    
    const caixas = await response.json();
    
    if (!Array.isArray(caixas)) {
      throw new Error('A resposta da API não é um array válido.');
    }

    const parseDate = (dStr: string) => {
      if (!dStr) return new Date();
      if (dStr.includes('/')) {
        const parts = dStr.split('/');
        if (parts[0].length === 4) { // YYYY/MM/DD
          return new Date(`${parts[0]}-${parts[1]}-${parts[2]}`);
        } else { // DD/MM/YYYY
          return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
      }
      if (dStr.length === 8 && !dStr.includes('-')) {
        // YYYYMMDD from ACF
        return new Date(`${dStr.substring(0, 4)}-${dStr.substring(4, 6)}-${dStr.substring(6, 8)}`);
      }
      return new Date(dStr);
    };

    let importedCaixas = 0;
    let importedTransactions = 0;

    for (const c of caixas) {
      const startDate = parseDate(c.data_inicial || c.data);
      const endDate = parseDate(c.data_final || c.data);
      
      const newCaixa = await this.prisma.cashRegister.create({
        data: {
          title: c.titulo || 'Caixa Importado',
          startDate,
          endDate,
        }
      });
      importedCaixas++;

      const transactions = c.transacoes || [];

      for (const t of transactions) {
        const tipoMeta = (t.tipo || 'entrada').trim().toLowerCase();
        
        if (tipoMeta === 'pedidos') continue;

        const wpCategoria = (t.categoria || 'Geral').trim();
        const amountStr = String(t.valor || '0').replace(',', '.');
        const amount = parseFloat(amountStr);
        
        const tDate = parseDate(t.data_pagamento || t.data);

        let category = wpCategoria;
        let dbType = (tipoMeta === 'saida' || tipoMeta === 'saída' || tipoMeta === 'saídas') ? 'OUTFLOW' : 'ENTRY';
        
        if (wpCategoria.toLowerCase() === 'frete') category = 'MOTOBOY';
        else if (wpCategoria.toLowerCase() === 'marketing') category = 'MARKETING';
        else if (wpCategoria.toLowerCase() === 'pagamento') category = 'FIXED_COSTS';
        else if (['saque-murilo', 'saque-thieko'].includes(wpCategoria.toLowerCase())) category = 'PARTNERS';
        else if (['murilo', 'thieko'].includes(wpCategoria.toLowerCase())) category = 'GENERAL';
        else if (wpCategoria.toLowerCase() === 'investimento') {
          category = 'INVESTMENT';
        }

        await this.prisma.cashTransaction.create({
          data: {
            cashRegisterId: newCaixa.id,
            type: dbType,
            category: category,
            amount: isNaN(amount) ? 0 : amount,
            description: t.titulo || 'Lançamento Importado',
            date: tDate,
          }
        });
        importedTransactions++;
      }
    }

    return { importedCaixas, importedTransactions };
  }
}
