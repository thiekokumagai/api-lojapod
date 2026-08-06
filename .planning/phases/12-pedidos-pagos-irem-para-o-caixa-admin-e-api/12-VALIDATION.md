---
phase: 12
slug: pedidos-pagos-irem-para-o-caixa-admin-e-api
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-22
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest / Supertest (API), Vitest / React Testing Library (Front) |
| **Config file** | `jest.config.js` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test:e2e` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test:e2e`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | TBD | — | N/A | unit | `npm run test` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/modules/cash-registers/domain/entities/cash-register.entity.spec.ts`
- [ ] `src/modules/cash-registers/domain/use-cases/create-cash-register.use-case.spec.ts`
- [ ] `src/modules/cash-registers/domain/use-cases/get-cash-register-summary.use-case.spec.ts`

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Schema Push | Prisma sync | Cannot run push automatically in E2E | Run `npx prisma db push --accept-data-loss` |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
