# Requisitos: ecommerce-core-api

## Visão Geral

Este documento rastreia e detalha os requisitos da refatoração de arquitetura limpa modular no `ecommerce-core-api`.

## Histórias de Usuário (User Stories)

- **Como Desenvolvedor da PodeMais**, quero que a lógica de negócios esteja separada do banco de dados (Prisma) e do framework (NestJS), para que eu possa escrever testes unitários velozes sem precisar criar mocks complexos de clientes de infraestrutura.
- **Como Arquiteto do Projeto**, quero que os módulos sejam altamente coesos e desacoplados, para garantir que mudanças de banco ou bibliotecas externas de upload de arquivos/geração de imagens não afetem o domínio central da aplicação.

## Requisitos Detalhados

### REQ-01: Estabelecer Diretrizes Arquiteturais (Arquitetura Limpa Modular)
- **Critérios de Aceitação**:
  - Criação do manual `ARCHITECTURE.md` contendo:
    - Definição clara da responsabilidade de cada camada (`domain`, `infrastructure`).
    - Padrão de nomeação e injeção de dependência via tokens/classes abstratas.
    - Estrutura de diretórios para novos módulos.

### REQ-02: Refatoração do Módulo Pioneiro (`categories`)
- **Critérios de Aceitação**:
  - Isolar a lógica de listagem, criação, atualização, exclusão e busca de categorias.
  - Eliminar `categories.service.ts` e injetar use cases específicos no controller de infraestrutura.
  - Criar o `PrismaCategoriesRepository` implementando a porta de domínio `ICategoriesRepository`.
  - Garantir compatibilidade total dos endpoints e testes E2E do módulo.

### REQ-03: Refatoração dos Módulos de Apoio (`users` e `variations`)
- **Critérios de Aceitação**:
  - Seguir o padrão pioneiro de categorias para desacoplar as entidades de usuários e opções de variações.
  - Garantir que todos os testes E2E passem sem quebras.

### REQ-04: Refatoração do Módulo Principal (`products`)
- **Critérios de Aceitação**:
  - Preservar o fluxo complexo de tratamento de estoque:
    - Produtos sem variação (`simple`) criam 1 item de estoque.
    - Produtos com variação criam múltiplos itens vinculados a opções de variação.
    - Transição de tipo limpa a estrutura existente em cascata e reinsere a nova estrutura.
  - Desacoplar use cases complexos (`CreateProductUseCase`, `UpdateProductStockUseCase`, etc.).
  - Mover o repositório Prisma de produto para a camada de infraestrutura.

### REQ-05: Refatoração do Módulo de Autenticação (`auth`)
- **Critérios de Aceitação**:
  - Desacoplar a lógica de geração/validação de tokens JWT e verificação de senha de dentro dos services.
  - Manter os Guards e Passport na camada de infraestrutura.

### REQ-06: Cobertura de Testes e Validação Swagger
- **Critérios de Aceitação**:
  - Manter testes unitários e E2E rodando e passando 100% via Jest.
  - Os DTOs com class-validator e decoradores do Swagger continuam funcionando e gerando a documentação Swagger na rota configurada.

### REQ-07: Dados de Inicialização (Seed) e Mock Data
- **Critérios de Aceitação**:
  - Não deve ser gerado mock data ou dados de exemplo para preenchimento de banco no arquivo de seed (`prisma/seed.ts`) ao criar novos módulos ou entidades.
  - O uso do `prisma/seed.ts` é restrito exclusivamente para a criação de usuários essenciais (ex: Admin) ou configurações fundamentais de sistema. A IA desenvolvedora deve tratar essa diretriz como Regra de Sistema.
