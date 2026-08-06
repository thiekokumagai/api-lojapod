---
title: "Mapa de Convenções"
last_updated: "2026-05-16"
---

# Mapa de Convenções

## Estilo de Código
- **Linter & Formatador:** Usa o pipeline moderno com o ESLint versão 9, com suporte direto do Prettier para formatação automática de texto e organização.
- **Aspas:** Como na maioria das convenções do NestJS com TypeScript, utiliza-se a preferência de aspas simples (single quotes), rigorosamente aplicada pelo Prettier.
- **Tipagem Estrita:** A flag de Strict Mode do TypeScript está geralmente ligada. Objetos de transferência de dados (DTOs) são altamente tipados através de declaradores visuais `@`.

## API & Controllers
- **Design RESTful:** Os endpoints respeitam a semântica REST padrão da indústria, onde o recurso base é afetado através de métodos coerentes (`GET /products` para listagens, `PATCH /products/:id` para atualizações parciais de informações raiz, `PATCH /products/:id/items` para atuar sobre os filhos do recurso principal).
- **Documentação com Swagger:** Todos os controladores de domínio usam decorators estruturais da biblioteca `@nestjs/swagger` (`@ApiOperation`, `@ApiResponse`, e `@ApiTags`) para auto-gerar uma especificação OpenAPI em tempo de execução e manter a API autodocumentada.
- **Validação de DTOs:** Todas as requisições de entrada de payload passam pelos validadores de injeção usando `class-validator` (decoradores de checagem estática como `@IsString()`, `@IsOptional()` e `@IsNumber()`) instalados nos modelos DTO.

## Tratamento de Erros
- **Exceções NestJS:** O framework se vale imensamente de suas instâncias globais e legíveis de HTTP Exceptions (ex: `NotFoundException`, `BadRequestException`). Elas são pegas no ciclo de vida requisição/resposta e elegantemente transformadas na família correta de status HTTP 4xx e 5xx.
- **Falhas de Prisma:** Erros do Prisma Query Engine (como quebra de constraint Unique em tentativas de e-mail duplicado) devem idealmente ser mapeados nos Services e relançados como Exceções HTTP locais, blindando assim os detalhes dos bancos de dados relacionais das mãos de clientes ou atacantes.

## Fluxo do Git
- **Mensagens de Commit:** As atualizações na árvore do git usam prefixos convencionais definidos pela equipe e pelo robô autônomo (ex. `feat:`, `fix:`, `docs:`) para garantir transparência.
- **Ramos:** O ambiente costuma prosseguir de modo centralizado por features no braço principal através do suporte metódico automatizado pelo robô no ecossistema de fluxos GSD.
