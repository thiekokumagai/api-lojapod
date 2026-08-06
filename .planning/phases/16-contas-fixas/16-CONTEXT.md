# Fase 16: Contas fixas - Contexto (Backend)

**Data de Coleta:** 2026-05-25
**Status:** Pronto para Planejamento
**Origem:** Solicitação do Usuário

<domain>
## Fronteiras da Fase (Fase 16)

Implementação do módulo de custos fixos ("Contas fixas") no backend, incluindo cadastro (CRUD) de despesas recorrentes ou parceladas com valor base/estimado, e a capacidade de dar baixa nesses custos registrando uma saída financeira associada ao caixa aberto.
As movimentações de caixa manuais (entradas/saídas) devem ser armazenadas em uma nova tabela de banco de dados (`CashTransaction`) para serem integradas e calculadas no resumo consolidado do Caixa, descontando as saídas e adicionando as entradas manuais no saldo final do lojista.
</domain>

<decisions>
## Decisões de Implementação

### 1. Modelagem do Banco de Dados (Prisma)
- **Tabela `FixedCost` (Custos Fixos/Contas Fixas)**:
  - `id`: `String` (UUID, Chave Primária)
  - `name`: `String` (Nome da conta, ex: "Aluguel", "Luz", "Marketing", "Água")
  - `value`: `Decimal` (Valor estimado ou fixado base da conta, formatado como `db.Decimal(10, 2)`)
  - `repeats`: `Boolean` (Define se a conta se repete recorrentemente. Padrão `true`)
  - `type`: `String` (Tipo de repetição. `"ALWAYS"` para sempre repetir de mês em mês, ou `"INSTALLMENTS"` para compras/contas parceladas)
  - `installmentsCount`: `Int` (Quantidade total de parcelas se o tipo for `"INSTALLMENTS"`, opcional, ex: 1 até 10 ou 12)
  - `createdAt`, `updatedAt`: `DateTime`
  
- **Tabela `CashTransaction` (Movimentações de Caixa)**:
  - `id`: `String` (UUID, Chave Primária)
  - `cashRegisterId`: `String` (Chave estrangeira opcional associada ao `CashRegister`)
  - `type`: `String` (Tipo da transação financeira. `"ENTRY"` para entrada manual ou `"OUTFLOW"` para saída manual de custos fixos/despesas)
  - `amount`: `Decimal` (Valor absoluto real pago/recebido na movimentação, formatado como `db.Decimal(10, 2)`)
  - `description`: `String` (Descrição da movimentação, ex: "Pagamento: Luz", "Ajuste manual de caixa")
  - `date`: `DateTime` (Data da movimentação, padrão `now()`)
  - `fixedCostId`: `String` (Chave estrangeira opcional associada ao `FixedCost` para auditoria e rastreio de pagamentos de contas fixas)
  - `createdAt`: `DateTime`

- **Relação em `CashRegister`**:
  - Adição de relação de um-para-muitos com `CashTransaction` para carregar as movimentações do caixa.

### 2. Fluxo de Pagamento de Contas Fixas
- Quando o usuário solicita pagar uma conta fixa no front-end, o front-end envia o payload contendo:
  - `amount`: O valor real a ser debitado (permite edição, por exemplo, a conta de luz veio em valor diferente).
  - `cashRegisterId`: ID do caixa aberto atualmente.
  - `description`: Descrição (opcional, defaults para "Pagamento: {Nome do Custo Fixo}").
- No backend, a ação cria um novo registro de `CashTransaction` com tipo `"OUTFLOW"`, vinculando ao custo fixo e ao caixa especificado.
- Se o custo fixo for parcelado (`"INSTALLMENTS"`), a criação registra qual parcela foi paga ou o fluxo gerencia o status para auditoria simples.

### 3. Integração com Relatório/Resumo de Caixa (`GetCashRegisterSummaryUseCase`)
- O cálculo do resumo financeiro no endpoint de caixa será estendido para:
  1. Carregar as ordens pagas no período e computar `totalReceived` (faturamento bruto comercial) e `cardFee` (taxas de cartão).
  2. Carregar todas as movimentações manuais `CashTransaction` associadas ao `cashRegisterId`:
     - Somar o valor total de movimentações do tipo `"ENTRY"` em `totalEntries`.
     - Somar o valor total de movimentações do tipo `"OUTFLOW"` em `totalOutflows`.
  3. Atualizar os saldos:
     - `totalGross` (Novo faturamento bruto total) = `totalReceived` + `totalEntries`.
     - `totalOutflows` (Total de saídas do caixa) = `totalOutflows`.
     - `totalCardFees` (Taxas comerciais) = `totalCardFees`.
     - `totalNet` (Saldo Líquido de Caixa) = `totalGross - totalCardFees - totalOutflows`.
  4. Retornar no payload:
     - A lista de `transactions` executadas para exibição no extrato/listagem de saídas e entradas do caixa.
     - `totalEntries` e `totalOutflows` discriminados.

### 4. Padrão Arquitetural
- O novo recurso de custos fixos será implementado seguindo o padrão de **Clean Architecture Modular** sob `src/modules/fixed-costs`:
  - `domain/entities/fixed-cost.entity.ts`
  - `domain/repositories/ifixed-costs.repository.ts`
  - `domain/use-cases/` (Criar, Listar, Atualizar, Deletar, Pagar Custo Fixo)
  - `infrastructure/controllers/fixed-costs.controller.ts`
  - `infrastructure/database/prisma-fixed-costs.repository.ts`
  - `infrastructure/dto/` (DTOs de entrada validados com `class-validator`)
- As rotas de transações manuais serão adicionadas ao módulo `cash-registers` ou integradas sob o endpoint de caixas.
</decisions>

<canonical_refs>
## Referências Canônicas

* [Esquema Prisma: prisma/schema.prisma](file:///c:/sites/podemais/ecommerce-api/prisma/schema.prisma)
* [Usecase de Caixa: src/modules/cash-registers/domain/use-cases/get-cash-register-summary.use-case.ts](file:///c:/sites/podemais/ecommerce-api/src/modules/cash-registers/domain/use-cases/get-cash-register-summary.use-case.ts)
* [Controller de Caixa: src/modules/cash-registers/infrastructure/controllers/cash-registers.controller.ts](file:///c:/sites/podemais/ecommerce-api/src/modules/cash-registers/infrastructure/controllers/cash-registers.controller.ts)
</canonical_refs>

<specifics>
## Ideias Específicas
- O sistema alertará caso o lojista tente pagar uma conta e nenhum caixa esteja aberto (exibindo um erro claro "Nenhum caixa ativo encontrado").
- O valor real de pagamento é editável e armazenado diretamente na transação, sem alterar o valor base/estimado configurado no cadastro de custos fixos.
</specifics>

<deferred>
## Ideias Adiadas
- Geração automática de faturas futuras no calendário financeiro (mantendo um fluxo puramente manual/operacional no painel).
</deferred>

---
*Fase: 16-contas-fixas*
*Contexto gerado: 2026-05-25 via solicitação direta do usuário*
