---
phase: 13
slug: parcelamento-cartao-de-credito-no-pedido-e-no-caixa
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-23
---

# Fase 13 — Estratégia de Validação

> Contrato de validação e amostragem de testes para a Fase 13.

---

## Infraestrutura de Testes

| Propriedade | Valor |
|-------------|-------|
| **Framework** | Jest / Supertest (API) |
| **Arquivo de Configuração** | `jest.config.js` |
| **Comando de Teste Rápido** | `npm run test` |
| **Comando de Suite Completa** | `npm run test:e2e` |
| **Tempo Estimado** | ~10 segundos |

---

## Frequência de Amostragem

- **Após cada commit de tarefa:** Executar `npm run test`
- **Após cada onda (wave) do plano:** Executar `npm run test:e2e`
- **Antes da homologação final:** A suite de testes inteira deve estar verde (aprovada)

---

## Mapa de Verificação por Tarefa

| ID da Tarefa | Plano | Onda | Requisito | Ameaça Seg. | Comportamento Seguro | Tipo de Teste | Comando Automatizado | Arquivo Existe | Status |
|--------------|-------|------|-----------|-------------|----------------------|---------------|----------------------|----------------|--------|
| 13-01-01 | 01 | 1 | Taxa Retida no Pedido | — | Persistência íntegra | unitário | `npm run test` | ❌ W0 | ⬜ pendente |
| 13-01-02 | 01 | 1 | Resumo Financeiro do Caixa | — | Separação Bruto/Taxa/Líquido | unitário | `npm run test` | ❌ W0 | ⬜ pendente |

*Status: ⬜ pendente · ✅ verde · ❌ vermelho · ⚠️ instável*

---

## Requisitos da Onda 0 (Wave 0)

- [ ] `src/modules/orders/domain/use-cases/receive-order.use-case.spec.ts`
- [ ] `src/modules/cash-registers/domain/use-cases/get-cash-register-summary.use-case.spec.ts`

---

## Validações Manuais

| Comportamento | Requisito | Motivo para ser Manual | Instruções de Teste |
|---------------|-----------|------------------------|---------------------|
| Sincronização do Prisma | Banco de dados | Requer banco ativo e schema atualizado | Executar `npx prisma db push` |

---

## Assinatura de Validação

- [x] Todas as tarefas possuem comandos automatizados ou dependências da Onda 0
- [x] Sem flags de modo de observação (watch-mode)
- [x] Tempo de feedback menor que 10s
- [x] `nyquist_compliant: true` definido no cabeçalho (frontmatter)

**Aprovação:** pendente
