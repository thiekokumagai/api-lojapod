# Phase 28: Importação do Caixa e Lançamentos Manuais (WP)

## Objetivo

Processar e importar os dados históricos do banco antigo do WordPress (podemais.sql) para as novas tabelas de CashRegister e CashTransaction, contemplando as novas categorias padronizadas e o modelo de saldo inicial via transação do tipo "Banco". Além disso, adequar o painel administrativo (Admin) e a API para criar caixas futuros suportando esse saldo inicial e utilizar a mesma padronização de categorias.

## Contexto e Decisões

Consulte `CONTEXT.md` para as diretrizes de mapeamento de categorias antigas para novas (ex: `frete` → `Motoboy / Frete`, `investimento` → integração de módulos) e a estratégia de lançamento do saldo inicial (`valor_inicial`).

## Planos

### [x] 28-01: Extensão da API para Criação de Caixa com Saldo Inicial

**Objetivo:** Permitir que, ao criar um novo caixa, o sistema registre automaticamente o seu valor de abertura.
**Tarefas:**

- Atualizar o DTO em `cash-registers.controller.ts` para aceitar um campo opcional `initialValue: number`.
- Atualizar o `CreateCashRegisterUseCase` no backend:
  - Criar o `CashRegister` normalmente.
  - Se `initialValue > 0`, criar simultaneamente um `CashTransaction` de tipo `ENTRY`, categoria `Banco` e descrição `Caixa Inicial`.

### [x] 28-02: Criação de Endpoint e UseCase de Importação do WP

**Objetivo:** Expor o script de importação (atualmente em `src/scripts`) via endpoint Rest para que o Admin possa invocá-lo.
**Tarefas:**

- Migrar a lógica do script `import-wp-financeiro.ts` para um Use Case dentro do módulo `imports` (ex: `ImportWpFinanceiroUseCase`).
- Criar a rota no backend: `POST /imports/wordpress/cash-registers` ou similar em `vendizap-imports.controller.ts` (ou criar um novo controller).
- Garantir que o UseCase procure o arquivo `podemais.sql` no servidor e rode com segurança as transações.

### [x] 28-03: Adaptação da Interface do Admin (Frontend) - Valor Inicial

**Objetivo:** Capturar o valor de abertura (moeda no caixa) através do painel.
**Tarefas:**

- Na página/modal onde o caixa é criado (`CashRegistersPage.tsx`), adicionar um campo numérico (com máscara de moeda) rotulado "Valor Inicial (R$)".
- Enviar esse valor na requisição `POST` para o endpoint de caixa atualizado na etapa 28-01.

### [x] 28-04: Padronização do Dropdown de Categorias (Frontend)

**Objetivo:** Refletir a mesma padronização de nomenclatura decidida no `CONTEXT.md` para novos lançamentos manuais.
**Tarefas:**

- Na página de detalhes do caixa (`CashRegisterDetailsPage.tsx`), localizar o modal de "Novo Lançamento Manual".
- Atualizar o elemento `<select>` de categorias para apresentar com exatidão as opções:
  - Motoboy / Frete
  - Marketing / Publicidade
  - Contas Fixas / Despesas Manuais
  - Salário / Sócios
  - Transferência p/ Investimento
  - Banco
  - Geral

### [x] 28-05: Gatilho de Importação no Admin (Frontend)

**Objetivo:** Prover o botão acionador da importação.
**Tarefas:**

- Na tela `ImportsPage.tsx` do Admin, adicionar uma sessão/card "Importação de Caixa e Lançamentos (Legacy WP)".
- Adicionar botão "Iniciar Importação", que realiza um `POST` para a rota criada na etapa 28-02.
- Mostrar indicativo de sucesso ou erro.

## Revisão e UAT

- O painel deve abrir caixas futuros informando 100 reais iniciais e exibir, nos registros financeiros daquele caixa, uma Entrada de 100 reais na categoria Banco.
- A lista de lançamentos só exibe as categorias corretas.
- Ao clicar em "Importar", os dados antigos devem ser listados no sistema com as novas categorias. Lançamentos de `investimento` devem constar tanto na listagem do Caixa como na página de Investimentos.
