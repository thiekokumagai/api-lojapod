-- "Peça também": onde cada oferta aparece para o cliente (carrinho, tela do produto ou os dois).
-- Só aditiva: cria o enum e UMA coluna com padrão 'CART', então toda oferta que já existe continua
-- aparecendo só no carrinho, exatamente como antes. Nenhum dado existente é alterado ou apagado.
-- NÃO foi aplicada em nenhum banco: quem aplica é o dono do projeto (prisma migrate deploy).
-- Idempotente (IF NOT EXISTS), porque a tabela order_bumps não aparece nas migrations anteriores
-- (o banco foi evoluído fora do histórico): se a tabela ainda não existir, nada é feito.

-- CreateEnum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderBumpDisplayLocation') THEN
    CREATE TYPE "OrderBumpDisplayLocation" AS ENUM ('CART', 'PRODUCT', 'BOTH');
  END IF;
END $$;

-- AlterTable
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'order_bumps'
  ) THEN
    ALTER TABLE "order_bumps"
      ADD COLUMN IF NOT EXISTS "displayLocation" "OrderBumpDisplayLocation" NOT NULL DEFAULT 'CART';
  END IF;
END $$;
