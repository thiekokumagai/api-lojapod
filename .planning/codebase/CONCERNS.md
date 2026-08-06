---
title: "Mapa de Preocupações"
last_updated: "2026-05-16"
---

# Mapa de Preocupações

## Dívida Técnica & Arquitetura
- **Sincronização de Estoque:** O modelo semântico atual associa as opções vinculadas de cada variação diretamente aos itens físicos transacionáveis (o `ProductItem`). Manusear a orquestração da remoção, adição e cruzamento dessas matrizes via front-end tem revelado um considerável grau de complexidade. É vital garantir extrema estabilidade de interface entre os payloads despachados pelo front e os endpoints unificados e coletivos ou singulares do backend em atualizações.
- **Custo Operacional de Imagens:** Redimensionamento imperativo (`sharp`) custa memória sob estresse. Num possível modelo que receba ataques e enxurradas de manipulações visuais da parte do admin, os processos que seguram e cospem as imagens re-otimizadas (`-thumb.webp`) podem onerar agressivamente a CPU.

## Segurança e Pontos Frágeis (Fragile Areas)
- **Desdobramento de Remoções:** Romper relações nas estruturas-mãe globais do prisma e propagar deleções na `Variation` ou `VariationOption` fatalmente corrói as relações hierárquicas downstream como `ProductVariation` e `ProductItemOption`. É uma premissa inegociável a atenção de não deixar a alteração do catálogo-mestre quebrar as amarras físicas das ordens atreladas aos estoques passados. Exclusões "moles" (soft deletes usando a flag `deletedAt`) existem no `Product` e `Variation` justamente para segurar essa barreira, mas as queries devem ter extrema responsabilidade de anexar sempre os filtros de integridade `deletedAt: null`.
- **Integridade da Grade e Hashes:** O modelo individual de estoque `ProductItem` garante a unicidade dos atributos físicos por um sistema de `hash` (geralmente gerado pelos IDs ordenados das opções alinhadas). Diferenças no gerador desse Hash entre os domínios (Front vs Back) vão forçar inconsistência grave nas duplicidades e pesquisas do Banco.

## Performance
- **Queries Excessivamente Aninhadas:** Buscas globais em `products.service.ts` ativam joins complexos de alto peso devido ao Prisma (`include` explícitos de profundidade nível 4: `items -> options -> option -> variation`). O impacto na base a longo prazo forçará otimizações N+1 e adoções massivas de paginações rasas.
