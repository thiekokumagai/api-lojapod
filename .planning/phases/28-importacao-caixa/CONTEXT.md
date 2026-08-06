# Phase 28: Importação do Caixa e Lançamentos Manuais (WP)

## Arquitetura de Dados e Decisões de Mapeamento (Importação)

O objetivo desta fase é processar os dados históricos de caixa e lançamentos manuais provenientes do sistema legado (WordPress) e adequá-los ao modelo de domínio da nova API. A nova estrutura abandona campos estáticos para saldo inicial e promove uma padronização mais profissional de fluxo de caixa (CashTransaction).

### Decisões Firmadas (Não alterar):

1. **Saldo Inicial (Caixa Inicial):**
   - O `valor_inicial` originado no WordPress não será adicionado como uma coluna na tabela `CashRegister`.
   - Em vez disso, todo valor inicial maior que `0` deve ser importado como um lançamento (`CashTransaction`) de entrada (`ENTRY`) com a categoria `"Banco"` e descrição `"Caixa Inicial (Importado)"`. A mesma lógica se aplicará na interface Admin para novos caixas criados futuramente.

2. **Reestruturação e Nomenclatura das Categorias Financeiras:**
   - As categorias manuais e mal padronizadas do sistema antigo foram mapeadas para um formato unificado e semântico no banco de dados, visando relatórios mais consistentes:
     - **`frete`** → `"Motoboy / Frete"` (Saída)
     - **`marketing`** → `"Marketing / Publicidade"` (Saída)
     - **`pagamento`** → `"Contas Fixas / Despesas Manuais"` (Saída)
     - **`saque-murilo`, `saque-thieko`, `murilo`, `thieko`** → `"Salário / Sócios"` (Saída)

3. **Integração do Módulo de Investimentos:**
   - Lançamentos com a categoria **`investimento`** na origem indicam dinheiro retirado do caixa para investir.
   - **No Caixa:** Será listado como uma saída (`OUTFLOW`) sob a categoria `"Transferência p/ Investimento"`.
   - **Nos Investimentos:** O mesmo valor será inserido automaticamente como uma **Entrada (`ENTRY`)** na tabela autônoma `InvestmentTransaction`. O script de importação já executa esta lógica, mantendo as duas carteiras conciliadas.

4. **Diretrizes para Interface Admin (Próxima Etapa):**
   - Na tela de Criar/Editar Caixas e nos modais de Lançamento Manual no Painel Administrativo, as categorias pré-definidas (dropdown) deverão ser atualizadas para refletir exatamente os novos nomes padronizados (`Motoboy / Frete`, `Salário / Sócios`, etc.).
   - O campo "Valor Inicial" no Admin enviará para o backend que o tratará como transação `"Banco"` no ato da abertura do caixa.
