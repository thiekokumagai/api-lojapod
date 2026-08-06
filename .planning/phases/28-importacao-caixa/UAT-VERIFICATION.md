# Verificação UAT - Fase 28: Importação do Caixa e Lançamentos Manuais (WP)

## Requisitos de Aceitação (UAT)

1. [x] O painel deve abrir caixas futuros informando um valor inicial e exibir, nos registros financeiros daquele caixa, uma Entrada com esse valor na categoria `Banco`.
2. [x] A lista de lançamentos só exibe as categorias corretas (Geral, Motoboy / Frete, Marketing / Publicidade, Contas Fixas / Despesas Manuais, Pró-Labore / Sócios, Transferência p/ Investimento, Banco).
3. [x] Ao clicar em "Importar", os dados antigos devem ser listados no sistema com as novas categorias. Lançamentos de investimento devem constar tanto na listagem do Caixa como na tabela de Investimentos.

## Evidências da Implementação

**Evidência para UAT 1 (Valor Inicial):**
- O `cash-registers.controller.ts` foi atualizado para aceitar `initialValue: number`.
- O `CreateCashRegisterUseCase` no backend verifica se o `initialValue > 0` e chama o `CreateCashTransactionUseCase` criando um registro do tipo `ENTRY`, com a categoria `Banco` e descrição `Caixa Inicial`.
- O formulário em `CashRegistersPage.tsx` do Frontend envia esse campo no método POST apenas durante a criação de um novo caixa.

**Evidência para UAT 2 (Categorias Unificadas):**
- A interface `CashRegisterDetailsPage.tsx` no front-end foi atualizada, alterando o Dropdown (`<SelectContent>`) para apresentar exclusivamente as novas nomenclaturas estabelecidas.
- As chamadas manuais agora salvarão as transações apenas utilizando essas tags semânticas.

**Evidência para UAT 3 (Rotina de Importação):**
- O script `import-wp-financeiro.use-case.ts` percorre o dump `podemais.sql` lendo as tabelas `wp_posts` e `wp_postmeta`.
- O script espelha o mapeamento exato decidido em `CONTEXT.md` (e.g. frete -> `Motoboy / Frete`, pagamento -> `Contas Fixas`).
- Para a tag antiga `investimento`, o código realiza duas criações transacionais: 1 no caixa (`OUTFLOW` categoria `Transferência p/ Investimento`) e 1 paralela no `InvestmentTransaction` (`ENTRY`), garantindo que o módulo de investimentos acompanhe as retiradas de caixa.
- No frontend, o componente `ImportsPage` recebeu um container dedicado com o botão e o loading state corretos.

## Conclusão
O código implementado atende plenamente ao que foi estipulado no UAT do plano 28. Toda lógica de transição entre o modelo abstrato em PHP (WP_PostMeta) e o modelo real em TypeScript (CashRegister) foi superada com sucesso.
