---
title: "Mapa de Integrações"
last_updated: "2026-05-16"
---

# Mapa de Integrações

## Banco de Dados
- **PostgreSQL:** Banco de dados relacional primário. É utilizado na persistência de instâncias vitais do projeto: usuários, produtos, categorias, variações de catálogo global e itens de estoque individual. Todo acesso é orquestrado exclusivamente via Prisma Client.

## Storage (Armazenamento de Objetos)
- **MinIO:** Servidor de armazenamento de objetos totalmente compatível com a interface S3 da Amazon.
  - **Uso Atual:** Usado principalmente para abrigar de forma distribuída e escalar as imagens de produtos. O módulo `minio` (utilizando a biblioteca `minio: ^8.0.7`) integra-se com a instância para gerenciar os uploads de dados binários diretos (ou geração de URLs pré-assinadas, caso aplicado no futuro).
  - **Geração de Imagens:** Possui um pipeline integrado à ferramenta `sharp` para paralelamente gerar versões menores das imagens submetidas (como um `-thumb.webp`) a fim de otimizar a renderização no front-end.

## Provedores de API & Autenticação
- **Autenticação Local JWT:** A API cria e valida de maneira autônoma e descentralizada os seus próprios JSON Web Tokens (usando `@nestjs/jwt`) para o controle de permissões e duração da sessão administrativa. No momento atual do ecossistema, não constam provedores OAuth de terceiros (como Google/Auth0) configurados na plataforma principal.

## Possíveis Integrações Futuras ou Ausentes
- **Gateway de Pagamentos:** Apesar de o foco ser a operação de produtos, não constam nas dependências bibliotecas de processadoras financeiras externas (ex: Pagar.me, Stripe, Mercado Pago), indicando que os mecanismos do checkout e pagamentos ou são delegados para outro microsserviço ou encontram-se num roadmap futuro.
