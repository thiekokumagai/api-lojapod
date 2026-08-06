---
title: "Mapa de Estrutura"
last_updated: "2026-05-16"
---

# Mapa de Estrutura

## Layout do Diretório

```text
ecommerce-core-api/
├── prisma/
│   ├── schema.prisma      # Definição do schema do banco de dados (modelos Prisma)
│   └── seed.ts            # Scripts de seed para popular o banco de dados
├── src/
│   ├── common/
│   │   └── types/         # Tipos globais e interfaces utilitárias
│   ├── minio/             # Módulo de integração com o storage MinIO (S3)
│   │   ├── minio.module.ts
│   │   └── minio.service.ts
│   ├── modules/
│   │   ├── auth/          # Módulo de autenticação (JWT, login, registro)
│   │   ├── categories/    # Módulo de gestão de categorias
│   │   ├── products/      # Módulo de produtos, variações e controle de estoque
│   │   ├── users/         # Módulo de gestão de usuários
│   │   └── variations/    # Módulo global do catálogo de variações (cores, tamanhos)
│   ├── app.module.ts      # Módulo raiz (root) da aplicação
│   └── main.ts            # Ponto de entrada que inicializa a aplicação NestJS
├── test/                  # Testes E2E (End-to-End) e configuração do jest
└── package.json           # Definição de dependências e scripts do projeto
```

## Locais Importantes
- **Schema do Banco de Dados:** O arquivo `prisma/schema.prisma` atua como a fonte central da verdade sobre a estrutura das tabelas.
- **Ponto de Entrada:** `src/main.ts` inicializa a aplicação NestJS e configura pipes globais (como validações estritas) e a documentação do Swagger.
- **Regras de Negócio:** Ficam localizadas dentro das classes dos serviços em `src/modules/<dominio>/<dominio>.service.ts`.
- **Endpoints de API:** Encontram-se definidos nos controladores em `src/modules/<dominio>/<dominio>.controller.ts`.

## Padrões de Nomenclatura (Convenções)
- **Arquivos:** Formato kebab-case acompanhado do tipo de sua responsabilidade como sufixo (ex: `products.controller.ts`, `products.service.ts`, `create-product.dto.ts`).
- **Classes:** PascalCase para componentes TypeScript (ex: `ProductsController`, `ProductsService`).
- **Interfaces e Tipos:** PascalCase, geralmente organizados e exportados em pastas como `dto`, `interfaces` ou isolados em `src/common/types`.
- **Constantes de ambiente ou globais:** UPPER_SNAKE_CASE.
