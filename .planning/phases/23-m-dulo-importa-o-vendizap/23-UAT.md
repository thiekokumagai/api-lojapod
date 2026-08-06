---
status: testing
phase: 23-m-dulo-importa-o-vendizap
source: [23-01-SUMMARY.md]
started: 2026-05-28T02:18:00Z
updated: 2026-05-28T02:18:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Cold Start Smoke Test
expected: |
  Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
awaiting: user response

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pending

### 2. Sincronização de Categorias
expected: No painel Admin, acessando a página "Módulo de Importação", ao clicar em "Sincronizar Categorias", as categorias do Vendizap devem ser importadas, vinculadas com as imagens, e o sistema deve exibir "Sucesso" na interface.
result: pending

### 3. Sincronização de Produtos
expected: Na página de importação, clicando em "Sincronizar Produtos", os produtos devem ser importados, relacionando com a categoria correspondente e com as imagens baixadas. O sistema deve exibir "Sucesso" na interface.
result: pending

### 4. Sincronização de Pedidos
expected: Na página de importação, clicando em "Sincronizar Pedidos", os pedidos do Vendizap devem ser importados, atrelando os itens e clientes. O sistema deve exibir "Sucesso" na interface.
result: pending

## Summary

total: 4
passed: 0
issues: 0
pending: 4
skipped: 0

## Gaps
