# Fase 13: Parcelamento e Taxas de Cartão de Crédito no Caixa e Pedidos - Contexto

**Data de Coleta:** 23/05/2026
**Status:** Pronto para Planejamento
**Origem:** Solicitação do Usuário

<domain>
## Fronteiras da Fase (Fase 13)

Integração de parcelamento dinâmico de cartão de crédito e controle financeiro de taxas no fluxo de recebimentos e no fechamento/resumo de caixas.
O sistema deve ler as regras de juros e parcelas configuradas pelo lojista, disponibilizar opções coerentes de parcelas na gaveta de recebimento de pedidos, deduzir a taxa de cartão apropriada de cada venda e discriminar os valores Brutos, Taxas e Líquidos no demonstrativo financeiro do Caixa.
</domain>

<decisions>
## Decisões de Implementação

### 1. Extensão do Modelo de Banco de Dados (Prisma)
- Adição da coluna `cardFee` (tipo `Decimal`, padrão `0.00`) no modelo `Order` no arquivo `schema.prisma`.
- Esta coluna registrará o valor monetário absoluto retido da transação (ex: taxas retidas por maquininha de cartão ou desconto de PIX/Dinheiro) para conciliação.

### 2. Lógica de Cálculo de Taxas no Backend (Decisão Final da Discussão)
- **Abrangência Ampla (Opção B)**: A lógica calculará a taxa/desconto de transação (`cardFee`) para **qualquer método de pagamento** que possua uma regra configurada em `paymentRules` nas configurações (como PIX, Dinheiro, Cartão de Débito ou Crédito).
- Se for Cartão de Crédito, buscará a regra associada à faixa de parcelas selecionada e calculará o juro sobre o bruto recebido.
- **Matemática Simples (Opção A)**: A taxa monetária retida será obtida aplicando a porcentagem da regra diretamente sobre o montante final recebido: `cardFee = totalReceived * rule.value` (com arredondamento de duas casas decimais padrão).
- **Estorno**: Se o recebimento for revertido, a `cardFee` será redefinida para `0`.

### 3. Exibição Estritamente Interna (Opção A)
- Os valores de taxa (`cardFee`) e faturamento líquido (`totalReceived - cardFee`) são dados **estritamente internos do lojista** para auditoria e conciliação financeira no Admin e no relatório de Caixa.
- **Cliente Final**: O cliente final recebe o comprovante (no WhatsApp ou PDF de impressão) contendo apenas os valores comerciais visíveis (itens, frete, desconto comercial, acréscimo comercial e total pago), sem nenhuma menção à taxa de transação retida internamente pela maquininha.

### 4. Consolidação Financeira de Caixa
- A API do resumo do caixa (`GetCashRegisterSummaryUseCase`) retornará três métricas consolidadas:
  - `totalGross` (Bruto): Soma do `totalReceived` de todas as vendas do caixa.
  - `totalCardFees` (Taxas): Soma da coluna `cardFee` de todas as vendas do caixa.
  - `totalNet` (Líquido): A receita real final (`totalGross - totalCardFees`).
- O payload de resumo do caixa do endpoint `/cash-registers/{id}/summary` será estendido para conter esta estrutura.

### 5. Interface Dinâmica de Recebimento no Admin (Frontend)
- O seletor de parcelas de cartão de crédito no frontend (`OrderDetailDrawer.tsx`) carregará as configurações gerais da loja (`useSettings`).
- Exibirá dinamicamente as parcelas de 1 até o maior `parcelaMax` cadastrado nas regras de crédito da loja.
- Ao alterar a parcela, calculará e mostrará visualmente em tempo real a taxa retida estimada (legenda informativa) antes de confirmar.
- A gaveta enviará a taxa calculada para ser armazenada no backend.
</decisions>

<canonical_refs>
## Referências Canonicas

**Agentes downstream DEVEM ler estas referências antes de planejar ou implementar.**

* [Esquema de Dados: prisma/schema.prisma](file:///c:/sites/podemais/ecommerce-api/prisma/schema.prisma)
* [Estrutura de Regras: types/settings.ts](file:///c:/sites/podemais/ecommerce-admin-front/src/types/settings.ts)
* [Visualização do Caixa: CashRegisterDetailsPage.tsx](file:///c:/sites/podemais/ecommerce-admin-front/src/pages/CashRegisterDetailsPage.tsx)
* [Recebimento de Pedido: OrderDetailDrawer.tsx](file:///c:/sites/podemais/ecommerce-admin-front/src/components/OrderDetailDrawer.tsx)
</canonical_refs>

<specifics>
## Ideias Específicas
- Caso não haja nenhuma regra de cartão de crédito cadastrada nas configurações, o sistema adotará por padrão que não há taxas (0% de juros) e limitará o parcelamento em 1x.
- A exibição do valor líquido ajuda o lojista a conciliar diretamente com o saldo disponível em sua conta digital/banco.
</specifics>

<deferred>
## Ideias Adiadas
Nenhuma — os requisitos cobrem integralmente o escopo solicitado pelo usuário.
</deferred>

---
*Fase: 13-parcelamento-cartao-de-credito-no-pedido-e-no-caixa*
*Contexto gerado: 2026-05-23 via solicitação direta do usuário*
