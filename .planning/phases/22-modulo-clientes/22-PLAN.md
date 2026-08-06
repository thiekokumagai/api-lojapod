# Phase 22: Módulo de Clientes

**Goal**: Criar e gerenciar a base de clientes do e-commerce. O backend foi atualizado para capturar automaticamente o cliente (buscando por telefone ou criando um novo com o endereço) no momento da criação de um pedido, vinculando-o ao `Order` e mantendo a integridade da Clean Architecture.

## Wave 1: Modelagem de Dados e Casos de Uso (Concluído)

- [x] **22-01: Atualização do Prisma Schema**
  - **Ação**: Criação dos modelos `Customer` e `CustomerAddress`.
  - **Ação**: Adição de `customerId` no modelo `Order`.
  - **Ação**: Executado `prisma db push` para sincronizar o banco.
  - `gap_closure`: false

- [x] **22-02: Lógica de Vinculação Automática no Repositório de Pedidos**
  - **Ação**: Atualização do `PrismaOrdersRepository.ts` (`saveWithStockDecrement`).
  - **Lógica**: Toda vez que um pedido entra, o sistema verifica o telefone (`customerPhone`). Se o cliente existe, vincula ao pedido. Se não existe, cria o cliente com as informações pessoais e de entrega, e vincula.
  - `gap_closure`: false

## Wave 2: Endpoints REST para Administração (Concluído)

- [x] **22-03: Módulo de Clientes (Clean Architecture)**
  - **Ação**: Criação das entidades `Customer` e `CustomerAddress`.
  - **Ação**: Criação da interface `ICustomersRepository` e da implementação `PrismaCustomersRepository`.
  - **Ação**: Criação dos Casos de Uso: `ListCustomersUseCase`, `GetCustomerUseCase`, e `UpdateCustomerUseCase`.
  - **Ação**: Criação do `CustomersController` com rotas protegidas (`GET /customers`, `GET /customers/:id`, `PUT /customers/:id`).
  - **Ação**: Registro do `CustomersModule` no `AppModule`.
  - `gap_closure`: false
