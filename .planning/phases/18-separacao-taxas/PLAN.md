# Fase 18: Separação de Taxas e Descontos (Back-end)

Este documento registra as alterações realizadas na API para separar e detalhar a origem dos descontos e acréscimos na criação e recebimento de pedidos.

## O Que Foi Feito

### 1. Banco de Dados (Prisma)
Foram adicionadas as seguintes colunas no modelo `Order` (`schema.prisma`):
- `paymentDiscount` (Decimal): Desconto oriundo de forma de pagamento.
- `installmentSurcharge` (Decimal): Acréscimo gerado por parcelamento.
- `couponDiscount` (Decimal): Desconto de cupom aplicado nos produtos.
- `couponFreightDiscount` (Decimal): Desconto de cupom aplicado no frete.
- `receiptDiscount` (Decimal): Desconto concedido no recebimento.
- `receiptSurcharge` (Decimal): Acréscimo imputado no recebimento.
- `appliedTaxRule` e `appliedCouponRule` (Json): Para salvar o log da regra aplicada.

**O schema foi atualizado via `npx prisma db push --accept-data-loss`.**

### 2. Entidade e DTO
- **Entidade (`order.entity.ts`):** Propriedades adicionadas para refletir as novas colunas.
- **DTO (`create-order.dto.ts`):** Adicionadas as propriedades opcionais para criação do pedido já com separação.

### 3. Casos de Uso
- **`CreateOrderUseCase`:**
  - Extração inteligente dos dados de cupom para separar o desconto do produto (`couponDiscount`) e desconto de frete (`couponFreightDiscount`).
  - Atualização do cálculo do campo `totalOrder` para suportar todos os novos campos de acréscimo e desconto.
- **`ReceiveOrderUseCase`:**
  - Recebe do frontend o payload detalhado.
  - Atualiza a entidade substituindo as chaves enviadas.
  - Recalcula e consolida os totais.

### 4. Controller (`OrdersController`)
- Endpoint `PATCH :id/receive` atualizado para receber o novo body flexível contendo os novos campos separados.
