---
title: "Mapa de Testes"
last_updated: "2026-05-16"
---

# Mapa de Testes

## Frameworks
- **Jest:** Configurado como a suíte líder de testes do ecossistema NestJS (`^30.0.0`). Ele funciona como test runner principal.
- **Supertest:** Provê utilitários essenciais para simulação e asserções em requisições HTTP da camada de e2e (end-to-end) sem expor portas de rede (`^7.0.0`).

## Estrutura
- **Testes Unitários:** Seguindo a cartilha de organização padrão do framework, os testes unitários costumam ser anexados ao lado do próprio arquivo avaliado, identificáveis pelo sufixo `.spec.ts`.
- **Testes Ponta a Ponta (E2E):** Existe um espaço próprio para eles na raiz, sob a pasta `test/`. Geralmente possuem nomes como `app.e2e-spec.ts`. A configuração deles diverge um pouco e se encontra no arquivo `test/jest-e2e.json`.

## Estado Atual do Projeto
- A fundação base da API aparenta carregar uma malha inicial (scaffolding) de testes e artefatos em boilerplate gerados originariamente pela CLI nativa do Nest (`@nestjs/cli`).
- Embora não exista indicação de mocking avançado e isolado dos serviços de banco em grande escala ainda, aconselha-se fortemente a utilização das ferramentas nativas (`Test.createTestingModule`) presentes no módulo `@nestjs/testing` na hora de simular os repositórios injetáveis.

## Cobertura (Coverage)
- Constam as definições base de métricas no JSON principal da raiz (`test:cov`), porém os direcionamentos de qualidade globais e imposição de gates mínimos por CI não se mostram declarados nas fronteiras desta checagem local.
