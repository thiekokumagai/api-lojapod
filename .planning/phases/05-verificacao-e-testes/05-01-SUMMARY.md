# Summary: 05-01 — Execução geral de testes unitários, E2E e validação Swagger

## Self-Check: PASSED

| Verificação | Resultado |
|-------------|-----------|
| `npm test` | 8/8 testes unitários passando |
| `npm run test:e2e` | 9/9 testes E2E passando |
| `npm run build` | Sucesso |
| Swagger `/api/docs` | UI e OpenAPI JSON validados |

## What Was Built

- Configuração Jest migrada para `jest.config.cjs` + `test/jest-e2e.config.cjs` (compatível com Jest 29 + ts-jest).
- Suíte E2E `test/api.e2e-spec.ts` cobrindo Swagger, auth, categories, users, variations e products.
- Helper `test/helpers/create-test-app.ts` espelhando bootstrap de produção.
- Correção do `DomainExceptionsFilter` para repassar `HttpException` do Nest (401/404 corretos).
- Swagger alinhado ao prefixo global: `useGlobalPrefix: true` em `main.ts` → rota `/api/docs`.

## Key Files

- `jest.config.cjs`
- `test/jest-e2e.config.cjs`
- `test/api.e2e-spec.ts`
- `test/helpers/create-test-app.ts`
- `src/common/filters/domain-exceptions.filter.ts`

## Deviations

- Jest downgrade 30 → 29.7.0 + dependência `jest-util` para compatibilidade com ts-jest no ambiente Windows.
- Teste de products usa `limit=5` e timeout 30s devido ao padrão N+1 em `findAll` do repositório.
