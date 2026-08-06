---
phase: 13
plan: 13-01
slug: parcelamento-cartao-de-credito-no-pedido-e-no-caixa
status: success
created: 2026-05-23
---

# Resumo de Execução do Plano 13-01 — Backend

> Implementação da persistência de taxas de cartão de crédito e débito, lógica de recebimento e consolidação financeira do Caixa.

---

## 🚀 Entregáveis Concluídos

1. **Esquema de Banco de Dados**:
   - Adicionada a coluna `cardFee` no model `Order` em `prisma/schema.prisma` com tipo `Decimal(10, 2)` e valor padrão `0`.
   - Executado o sincronismo do banco de dados com `npx prisma db push` e regeneração dos tipos do TypeScript via `npx prisma generate`.
2. **Entidade de Domínio**:
   - Atualizada a entidade `Order` em `order.entity.ts` incluindo o atributo `cardFee` no modelo puro.
3. **Persistência de Repositório**:
   - Atualizado o `PrismaOrdersRepository` para ler a propriedade `cardFee` na conversão de banco para domínio (`mapToDomain`) e salvar a propriedade nos métodos `save` e `saveWithStockDecrement`.
4. **Casos de Uso Operacionais**:
   - **`ReceiveOrderUseCase`**: Atualizado para receber as parcelas (`installments`), mapear a forma de pagamento e buscar dinamicamente as regras ativas de taxas (`settings.paymentRules`). Se for crédito ou débito e houver taxas configuradas como acréscimos (`charge`), calcula a taxa retida e a grava no pedido.
   - **`RevertReceiveOrderUseCase`**: Atualizado para restaurar o `cardFee` do pedido de volta para `0` em caso de reversão de pagamento.
   - **`GetCashRegisterSummaryUseCase`**: Implementadas as somas de `totalCardFees` (taxas de cartão acumuladas no caixa) e do faturamento líquido real `totalNet` (`totalGross - totalCardFees`) para exibição estatística do Caixa.

---

## 🔍 Detalhes Técnicos das Mudanças

```diff
diff --git a/prisma/schema.prisma b/prisma/schema.prisma
index 7cf38a0..15ea3a1 100644
--- a/prisma/schema.prisma
+++ b/prisma/schema.prisma
@@ -208,6 +208,7 @@ model Order {
   totalOrder      Decimal     @db.Decimal(10, 2)
   totalReceived   Decimal     @db.Decimal(10, 2)
   surcharge       Decimal     @default(0) @db.Decimal(10, 2)
+  cardFee         Decimal     @default(0) @db.Decimal(10, 2)
```

---

## 🧪 Verificação e Build

- Compilação realizada com sucesso:
  ```bash
  $ npm run build
  # Sucesso total - 0 erros detectados
  ```
- Servidor reiniciado e operacional na porta padrão em segundo plano.
