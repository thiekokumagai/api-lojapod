# Cronograma (Roadmap): ecommerce-core-api

## Visão Geral

Este cronograma detalha as fases necessárias para refatorar o backend `ecommerce-core-api` para uma Arquitetura Limpa Modular sem interromper ou quebrar as funcionalidades existentes de e-commerce.

## Marcos (Milestones)

- 🚧 **v1.0 Refatoração Clean Architecture** - Fases 1-5 (concluído)

## Fases

- [x] **Fase 1: Diretrizes Arquiteturais** - Estabelecer o manual da arquitetura limpa e inicializar o projeto
- [x] **Fase 2: Refatoração do Módulo Pioneiro (categories)** - Validar o padrão desacoplando categorias
- [x] **Fase 3: Refatoração de Apoio (users, variations)** - Aplicar padrão aos módulos simples de suporte
- [x] **Fase 4: Refatoração Principal (products, auth)** - Migrar a lógica complexa de estoque e autenticação (Concluído em 17/05/2026)
- [x] **Fase 5: Verificação e Testes** - Garantir estabilidade com suíte de testes unitários e E2E completa (Concluído em 17/05/2026)

## Detalhes das Fases

### Fase 1: Diretrizes Arquiteturais

**Objetivo**: Definir as especificações de design e diretórios da Arquitetura Limpa Modular.
**Depende de**: Nada
**Requisitos**: REQ-01
**Critérios de Sucesso**:

  1. O arquivo `.planning/codebase/ARCHITECTURE.md` existe detalhando as responsabilidades de cada camada.
  2. O manual de desenvolvimento em PT-BR está disponível.

**Planos**: 1 plano

Planos:

- [x] 01-01: Criar manual arquitetural e diretrizes de design

---

### Fase 2: Refatoração do Módulo Pioneiro (categories)

**Objetivo**: Desacoplar completamente o módulo de categorias em camadas.
**Depende de**: Fase 1
**Requisitos**: REQ-02
**Critérios de Sucesso**:

  1. A pasta `src/modules/categories/domain` contém a entidade pura, port do repositório e os use cases.
  2. A pasta `src/modules/categories/infrastructure` contém os controllers, DTOs e repositório Prisma.
  3. O arquivo `categories.service.ts` foi deletado com sucesso.
  4. Testes E2E de categorias passam sem alterações na API pública.

**Planos**: 1 plano

Planos:

- [x] 02-01: Refatorar o módulo de categorias para Clean Architecture

---

### Fase 3: Refatoração de Apoio (users, variations)

**Objetivo**: Aplicar o padrão de camadas aos módulos de usuários e variações.
**Depende de**: Fase 2
**Requisitos**: REQ-03
**Critérios de Sucesso**:

  1. Módulo `users` refatorado com injeção de use cases e repositório Prisma desacoplado.
  2. Módulo `variations` refatorado de forma análoga.
  3. Serviços antigos deletados.

**Planos**: 2 planos

Planos:

- [x] 03-01: Refatorar módulo de usuários (users)
- [x] 03-02: Refatorar módulo de variações (variations)

---

### Fase 4: Refatoração Principal (products, auth)

**Objetivo**: Refatorar o núcleo complexo de catálogo, regras de estoque e fluxo de segurança.
**Depende de**: Fase 3
**Requisitos**: REQ-04, REQ-05
**Critérios de Sucesso**:

  1. Módulo `products` estruturado em camadas de domínio e infraestrutura.
  2. A lógica complexa de estoque de produtos simples/com variação e transição de tipos é isolada em use cases específicos do domínio.
  3. O módulo `auth` está devidamente isolado com use cases de login, validação e refresh de token.

**Planos**: 2 planos

Planos:

- [x] 04-01: Refatorar módulo de produtos (products)
- [x] 04-02: Refatorar módulo de autenticação (auth)

---

### Fase 5: Verificação e Testes

**Objetivo**: Validar a integridade, compatibilidade pública e testabilidade do sistema.
**Depende de**: Fase 4
**Requisitos**: REQ-06
**Critérios de Sucesso**:

  1. Execução de todos os testes unitários com 100% de sucesso.
  2. Execução de testes E2E do Supertest confirmando integridade de todos os endpoints HTTP.
  3. A documentação Swagger (/api/docs) renderiza perfeitamente com todas as tags de contratos das DTOs de infraestrutura.

**Planos**: 1 plano

Planos:

- [x] 05-01: Execução geral de testes unitários, E2E e validação Swagger

---

## Progresso Geral

| Fase | Marco (Milestone) | Planos Concluídos | Status | Data de Conclusão |
|------|-------------------|-------------------|--------|-------------------|
| 1. Diretrizes Arquiteturais | v1.0 | 1/1 | Concluído | 17/05/2026 |
| 2. Módulo Pioneiro (categories) | v1.0 | 1/1 | Concluído | 17/05/2026 |
| 3. Módulos Apoio (users, variations) | v1.0 | 2/2 | Concluído | 17/05/2026 |
| 4. Módulos Core (products, auth) | v1.0 | 2/2 | Concluído | 17/05/2026 |
| 5. Verificação e Testes | v1.0 | 1/1 | Concluído | 17/05/2026 |
| 6. Módulo de Configurações | v1.0 | 2/2 | Concluído | 17/05/2026 |
| 7. Módulo de Pedidos | v1.0 | 1/1 | Concluído | 19/05/2026 |
| 8. Integração Pedidos & Estoque | v1.0 | 1/1 | Concluído | 19/05/2026 |
| 9. Melhorias Checkout & Pedidos | v1.0 | 1/1 | Concluído | 20/05/2026 |
| 10. Ajustes UI Pedidos | v1.0 | 1/1 | Concluído | 21/05/2026 |
| 11. Paginação e Fluxo Financeiro | v1.0 | 1/1 | Concluído | 21/05/2026 |
| 12. Pedidos pagos irem para o caixa | v1.0 | 0/1 | Em Execução | — |
| 13. Parcelamento e Taxas de Cartão | v1.0 | 0/1 | Planejado | — |

---

### Fase 6: Implementação do Módulo de Configurações (StoreSettings)

**Objetivo:** Implementar o modelo StoreSettings no banco de dados Prisma e a API Restful no NestJS, e conectar os formulários unificados do painel administrativo.
**Requisitos**: REQ-07
**Depende de:** Fase 5
**Planos:** 2 planos

Planos:

- [x] 06-01: Banco de Dados e Módulo API de Configurações (Backend)
- [x] 06-02: Formulários e Integração no Painel Administrativo (Frontend)

---

### Fase 7: Módulo e Gestão de Pedidos (Orders)

**Objetivo:** Implementar o modelo de banco de dados para Pedidos e Itens de Pedido no Prisma, a API REST no NestJS seguindo a Clean Architecture.
**Requisitos**: REQ-08
**Depende de:** Fase 6
**Planos:** 1 plano

Planos:

- [x] 07-01: Extensão do Schema, DTO e Repositório da API para Módulo de Pedidos (Backend)

---

### Fase 8: Integração Dinâmica de Pedidos e Estoque

**Objetivo:** Interligar pedidos aos produtos e variações reais do banco de dados, decrementando o estoque na confirmação e revertendo no cancelamento.
**Requisitos**: REQ-08, REQ-09
**Depende de:** Fase 7
**Planos:** 1 plano

Planos:

- [x] 08-01: Associação de Pedidos a Produtos Reais, Validação e Atualização Dinâmica de Estoque (Backend & Frontend)

---

### Fase 9: Melhorias no Checkout e Pedidos

**Objetivo:** Dividir o ciclo de vida do pedido entre entrega e pagamento, criando endpoints específicos para recebimento e reversão.
**Depende de:** Fase 8
**Planos:** 1 plano

Planos:

- [x] 09-01: Melhorias no Checkout e Pedidos (Backend)

---

### Fase 10: Ajustes UI na Listagem e Modal de Pedidos

**Objetivo:** Incrementar usabilidade e filtros adicionais de frontend integrando os dropdowns logísticos na gaveta de detalhamento.
**Depende de:** Fase 9
**Planos:** 1 plano

Planos:

- [x] 10-01: Ajustes UI na Listagem e Modal de Pedidos (Alinhamento Frontend & Backend)

---

### Fase 11: Paginação e Refinamentos do Fluxo Financeiro de Pedidos

**Objetivo:** Adicionar paginação nativa server-side e consolidar as regras visuais de recebimento e cancelamento de pedidos.
**Depende de:** Fase 10
**Planos:** 1 plano

Planos:

- [x] 11-01: Paginação e Refinamentos de Fluxo Financeiro (Backend & Frontend)

---

### Fase 12: Pedidos pagos irem para o caixa admin e api

**Objetivo:** [A ser planejado]
**Requisitos**: TBD
**Depende de:** Fase 11
**Planos:** 0 planos

Planos:

- [ ] TBD (execute o comando `/gsd-plan-phase 12` para detalhar)

### Phase 14: Configurar taxas de debito/credito com repasse opcional ao cliente

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 13
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 14 to break down)

---

### Fase 13: Parcelamento e Taxas de Cartão de Crédito no Caixa e Pedidos

**Objetivo:** Implementar a lógica de parcelamento dinâmico de cartão de crédito integrado às configurações do lojista, calculando os juros e taxas descontados por pedido e consolidando os totais Bruto, Taxas e Líquido no resumo do caixa.
**Depende de:** Fase 12
**Planos:** 1 plano

Planos:

- [ ] 13-01: Implementação de Parcelamento, Taxas de Cartão e Consolidação Financeira (Backend & Frontend)

### Phase 16: Contas fixas

**Goal:** [To be planned] - Poder excluir lançamento das contas fixas no caixa
**Requirements**: TBD
**Depends on:** Phase 15
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 16 to break down)

---

### [CONCLUÍDO] Fase 15: Módulo de Cupom

**Objetivo:** Criar módulo de cupons de desconto (valor fixo, porcentagem ou frete grátis), com regras de limite de uso e datas de validade, integrado ao checkout de pedidos.
**Requisitos**: TBD
**Depende de:** Fase 14
**Planos:** 1 plano

Planos:

- [x] 15-01: Módulo de Cupom no Backend e Frontend

### Phase 23: Módulo importação vendizap

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 22
**Plans:** 1/1 plans complete

Plans:

- [x] TBD (run /gsd-plan-phase 23 to break down) (completed 2026-05-28)

### Phase 24: criar pedidos cliente fazer no back e front cliente

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 23
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 24 to break down)

### Phase 25: Rota pedido cliente especifica, implementacao no front cliente

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 24
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 25 to break down)

---

### Fase 22: Módulo de Clientes

**Objetivo:** Criar e gerenciar a base de clientes. O sistema deve capturar o cliente automaticamente (buscar por telefone ou criar um novo junto com seu endereço) no momento da geração do pedido, vinculando-o ao `Order`.
**Requisitos**: TBD
**Depende de:** Fase 21
**Planos:** 3 planos

Planos:

- [x] 22-01: Atualização do Prisma Schema
- [x] 22-02: Lógica de Vinculação Automática no Repositório de Pedidos
- [x] 22-03: Módulo de Clientes (Clean Architecture)

### Phase 27: Atualizações em Tempo Real (Websockets)

**Goal:** Implementar WebSocket para atualizar a lista de pedidos no painel admin e a disponibilidade de produtos no front cliente em tempo real.
**Requirements**: TBD
**Depends on:** Phase 26
**Plans:** 2/2 plans complete

Plans:

- [x] 27-01: Implementar WebSocket (Backend)
- [x] 27-02: Integração WebSocket (Frontend Cliente e Admin)

---

### Fase 26: Quando criar pedido e zerar produto desabilitar ele, caso cancelar o pedido adicionar o estoque de volta

**Objetivo:** [A ser planejado]
**Requisitos**: TBD
**Depende de:** Fase 25
**Planos:** 1/1 planos concluídos

Planos:

- [x] 26-01: Desabilitar e reabilitar produto conforme o estoque nas operações do pedido

---

### Fase 28: Importação do Caixa e Lançamentos Manuais (WP)

**Objetivo:** Importar caixas e lançamentos financeiros do backup do WordPress (podemais.sql) para a nova API e Admin, contemplando também o valor inicial de cada caixa inserido como uma transação (ex: categoria "Banco" ou "Caixa Inicial").
**Requisitos**: TBD
**Depende de:** Fase 27
**Planos:** 2/2 planos concluídos

Planos:

- [x] 28-01: Criar script de importação e endpoints para importação do SQL.
- [x] 28-02: Adaptar interface Admin para realizar importação e suportar Caixa Inicial.
