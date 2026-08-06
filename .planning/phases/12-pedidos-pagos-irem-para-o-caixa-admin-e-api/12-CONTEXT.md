# Phase 12: Pedidos pagos irem para o caixa admin e api - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning
**Source:** User discussion

<domain>
## Phase Boundary

Integração de pedidos pagos com um fluxo de Caixa. O sistema permitirá criar caixas com títulos (ex: "Março 2026") e datas de início/fim. Todos os pedidos recebidos (pagos) que caírem entre as datas do caixa entrarão como recebimentos desse caixa.
</domain>

<decisions>
## Implementation Decisions

### Modelagem do Caixa
- Caixas terão `title` (ex: "Março 2026", "Abril 2026"), `startDate` e `endDate`.
- Somente recebimentos/pedidos pagos que ocorrerem entre a `startDate` e a `endDate` serão contabilizados no caixa respectivo.
- Pedidos não pagos ou estornados NÃO entram nos totais consolidados do caixa (ou geram contra-partida).

### the agent's Discretion
- A tabela/modelo do banco de dados para representar o "Caixa" (`CashRegister` ou equivalente) e as rotas CRUD.
- Como o front-end listará e fará a consolidação visual do total do caixa (UI do dashboard).
- A estratégia de associação técnica (se o pedido salva o ID do caixa no recebimento, ou se o caixa apenas faz a soma agregada por data na API).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements fully captured in decisions above.
</canonical_refs>

<specifics>
## Specific Ideas
- Os caixas têm nomeação amigável e funcionam como períodos contábeis ou de apuração (ex: meses).
</specifics>

<deferred>
## Deferred Ideas
None — PRD covers phase scope
</deferred>

---

*Phase: 12-pedidos-pagos-irem-para-o-caixa-admin-e-api*
*Context gathered: 2026-05-22 via user discussion*
