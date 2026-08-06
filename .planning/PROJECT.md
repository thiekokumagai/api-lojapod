# Projeto: ecommerce-core-api

## O Que É Este Projeto

O `ecommerce-core-api` é a API backend principal da plataforma de e-commerce PodeMais, desenvolvida com NestJS 11, TypeScript e Prisma ORM (banco PostgreSQL). Ela gerencia autenticação, usuários, categorias, variações de produto e controle de estoque de produtos simples e complexos (com variações).

## Valor Central

Prover uma API de e-commerce robusta, segura, desacoplada e escalável, que garanta consistência no controle de estoque de produtos e performance sob alta demanda.

## Requisitos

### Validados (Concluídos)

- ✓ Controle básico de produtos simples (sem variações) e complexos (com variações) — existente
- ✓ Autenticação JWT e gerenciamento de permissões via Passport — existente
- ✓ Integração com Prisma ORM e PostgreSQL — existente

### Ativos

- [ ] REQ-01: Estabelecer as regras e padrões de Arquitetura Limpa Modular (Modular Clean Architecture)
- [ ] REQ-02: Refatorar o módulo de categorias (`categories`) como módulo pioneiro da arquitetura limpa
- [ ] REQ-03: Refatorar os módulos de apoio (`users` e `variations`)
- [ ] REQ-04: Refatorar o núcleo de produtos (`products`), preservando as regras de estoque e alteração de variações
- [ ] REQ-05: Refatorar o fluxo de autenticação (`auth`) desacoplando controllers e use cases
- [ ] REQ-06: Garantir cobertura de testes unitários nos use cases e testes de ponta-a-ponta (E2E) nas novas rotas

### Fora de Escopo

- [Exclusão 1] — Migração de banco de dados (o banco continua PostgreSQL gerenciado via Prisma)
- [Exclusão 2] — Criação de novos endpoints de checkout/carrinho (foco estritamente na refatoração da estrutura atual)

## Contexto

O projeto atual sofria de alto acoplamento nos arquivos `*.service.ts`, que misturavam lógica de banco de dados (Prisma), validações de regras de negócios e tratamento de erros. A refatoração visa separar essas preocupações em camadas claras, facilitando testes unitários rápidos e independência de infraestrutura.

## Restrições

- **Stack**: NestJS 11 + TypeScript + Prisma ORM (Manter a stack técnica) — Sem permissão para mudar framework ou ORM.
- **Retrocompatibilidade**: Os contratos de API HTTP e endpoints atuais não podem quebrar (garantido por testes E2E).
- **Sem Dados Fictícios de Domínio**: É expressamente proibido popular dados falsos/mockados (categorias, produtos, vendas, pedidos) no arquivo `prisma/seed.ts` e em novos módulos. Apenas registros estritamente fundamentais do sistema, como contas de Admin, são permitidos. A IA deve tratar esta regra como primária no desenvolvimento.

## Decisões Principais

| Decisão | Justificativa | Resultado |
|---------|---------------|-----------|
| Arquitetura Limpa Modular | Manter as fronteiras nativas do NestJS agrupando o código por funcionalidade | — Concluído |

## Evolução

Este documento evolui na transição de fases e marcos (milestones).

---
*Última atualização: 2026-05-17 após inicialização*
