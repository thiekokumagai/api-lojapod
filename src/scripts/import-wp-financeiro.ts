import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function run() {
  console.log('Baixando dados do financeiro do WordPress via API...');
  
  const response = await fetch('https://podemais.shop/wp-json/api/v1/listar-caixas');
  
  if (!response.ok) {
    console.error(`Erro ao acessar API: ${response.status} ${response.statusText}`);
    return;
  }
  
  const caixas = await response.json();
  
  if (!Array.isArray(caixas)) {
    console.error('A resposta da API não é um array válido.');
    return;
  }

  let totalTransacoesEncontradas = 0;
  caixas.forEach((c: any) => totalTransacoesEncontradas += (c.transacoes?.length || 0));
  
  console.log(`Encontrados ${caixas.length} caixas e ${totalTransacoesEncontradas} transações.`);

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

  // Importar para o DB
  let importedCaixas = 0;
  
  for (const c of caixas) {
    const startDate = parseDate(c.data_inicial || c.data);
    const endDate = parseDate(c.data_final || c.data);
    
    // Create Caixa
    const newCaixa = await prisma.cashRegister.create({
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
      const amount = parseFloat(t.valor || '0');
      
      const tDate = parseDate(t.data_pagamento || t.data);

      // Tratamento e Tradução das Categorias
      let category = wpCategoria;
      let dbType = (tipoMeta === 'saida' || tipoMeta === 'saída' || tipoMeta === 'saídas') ? 'OUTFLOW' : 'ENTRY';
      
      if (wpCategoria.toLowerCase() === 'frete') category = 'MOTOBOY';
      else if (wpCategoria.toLowerCase() === 'marketing') category = 'MARKETING';
      else if (wpCategoria.toLowerCase() === 'pagamento') category = 'FIXED_COSTS';
      else if (['saque-murilo', 'saque-thieko'].includes(wpCategoria.toLowerCase())) category = 'PARTNERS';
      else if (['murilo', 'thieko'].includes(wpCategoria.toLowerCase())) category = 'GENERAL';
      else if (wpCategoria.toLowerCase() === 'investimento') {
        category = 'INVESTMENT';
        
        // Se for investimento, também criar na tabela InvestmentTransaction se for saída
        if (dbType === 'OUTFLOW' && !isNaN(amount) && amount > 0) {
          await prisma.investmentTransaction.create({
            data: {
              type: 'ENTRY',
              amount: amount,
              description: `Importado de Caixa: ${t.titulo || wpCategoria}`,
              createdAt: tDate,
            }
          });
        }
      }

      await prisma.cashTransaction.create({
        data: {
          cashRegisterId: newCaixa.id,
          type: dbType,
          category: category,
          amount: isNaN(amount) ? 0 : amount,
          description: t.titulo || 'Lançamento Importado',
          date: tDate,
        }
      });
    }
  }

  console.log(`Sucesso: ${importedCaixas} caixas importados junto com seus lançamentos.`);
}

run()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
