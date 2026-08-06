---
title: "Mapa da Stack Tecnológica"
last_updated: "2026-05-16"
---

# Mapa da Stack Tecnológica

## Linguagem & Runtime
- **Linguagem Principal:** TypeScript (`v5.7.3`)
- **Runtime:** Node.js (conforme declaração de tipos direcionada à versão v24)
- **Gerenciador de Pacotes:** npm (inferido pelo uso comum e pela presença do package.json)

## Frameworks & Bibliotecas Core
- **Framework Backend:** NestJS (`^11.1.18`) - Plataforma baseada nativamente em Express.
- **ORM do Banco de Dados:** Prisma (`^5.22.0`)
- **Validação de Dados:** `class-validator` (`^0.14.4`) e `class-transformer` (`^0.5.1`)
- **Autenticação e Segurança:** Passport (`passport-jwt`, integrado e encriptado com `bcrypt`)

## Utilitários & Ferramentas
- **Processamento de Imagens:** Sharp (`^0.34.5`) - Utilizado para o redimensionamento dinâmico de imagens e a geração eficiente de thumbnails.
- **Upload de Arquivos:** Multer (`^2.1.1`) - Gerencia envios form-data (multipart).
- **Geração de IDs:** uuid (`^13.0.0`)
- **Ferramentas de Desenvolvimento:** ts-node, tsx, eslint, prettier

## Configuração
- **Variáveis de Ambiente:** `@nestjs/config` é o pacote oficial utilizado para o carregamento do ambiente.
- **TypeScript:** O compilador é configurado rigorosamente pelo `tsconfig.json`.
- **Formatação & Linter:** ESLint (`^9.18.0`) responsável por manter a coerência das práticas de código e Prettier (`^3.8.1`) garante o estilo visual padronizado.
