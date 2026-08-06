import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../prisma/prisma.service';

@Injectable()
export class ImportWpProductCostsUseCase {
  constructor(private prisma: PrismaService) {}

  async execute(): Promise<any> {
    const response = await fetch('https://podemais.shop/wp-json/api/v1/listar-produtos');
    
    if (!response.ok) {
      throw new Error(`Erro ao acessar API: ${response.status} ${response.statusText}`);
    }
    
    const products = await response.json();
    
    if (!Array.isArray(products)) {
      throw new Error('A resposta da API não é um array válido.');
    }

    let updatedCount = 0;
    let notFoundCount = 0;

    for (const item of products) {
      if (!item.id_vendizap || item.valor_custo === undefined || item.valor_custo === null || item.valor_custo === '') {
        continue;
      }

      const costStr = String(item.valor_custo).replace(',', '.');
      const custoValue = parseFloat(costStr);
      
      if (isNaN(custoValue) || custoValue <= 0) {
        continue;
      }

      const existingProduct = await this.prisma.product.findUnique({
        where: { externalId: item.id_vendizap }
      });

      if (existingProduct) {
        await this.prisma.product.update({
          where: { id: existingProduct.id },
          data: { costPrice: custoValue }
        });
        updatedCount++;
      } else {
        notFoundCount++;
      }
    }

    return {
      message: 'Custos importados com sucesso da API!',
      data: {
        totalFoundInApi: products.length,
        updatedProducts: updatedCount,
        productsNotFound: notFoundCount
      }
    };
  }
}
