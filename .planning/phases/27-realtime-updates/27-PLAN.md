# Phase 27: Atualizações em Tempo Real (Websockets) - Plan

**Status:** Planned
**Goal:** Implementar WebSocket para atualizar a lista de pedidos no painel admin e a disponibilidade de produtos no front cliente em tempo real.

<threat_model>
- Sem necessidade de autenticação rigorosa no momento para eventos genéricos de catálogo, mas o WebSocket admin idealmente deveria exigir verificação de token ou ser um namespace restrito para não vazar a lista de pedidos a clientes normais.
</threat_model>

<plan>
### 27-01: Implementar WebSocket (Backend)
**Directory:** `ecommerce-api`

1. **Instalar dependências de WebSockets do NestJS**:
   - Rodar `npm install @nestjs/websockets @nestjs/platform-socket.io` e suas tipagens, caso não existam.

2. **Criar os Gateways (Eventos)**:
   - Criar `src/modules/events/events.gateway.ts` (ou módulo de websockets separado).
   - Configurar namespaces se necessário (ex: `/admin` para ordens e `/public` para produtos).
   - Implementar método para emitir `order.created` ou `order.new`.
   - Implementar método para emitir `product.stock_updated`.

3. **Injetar o Gateway nos Use Cases**:
   - No caso de uso de criação de pedidos (`CreateOrderUseCase`), injetar o gateway e emitir o evento após criar o pedido e atualizar o estoque.
   - Quando o estoque do produto chegar a zero, emitir o evento notificando a indisponibilidade.

4. **Configurar o WebSocket na main**:
   - Garantir que o app.enableCors() também aplique ao adapter do WebSocket se necessário.
   - Registrar o `EventsModule` no `AppModule`.

### 27-02: Integração WebSocket (Frontend Cliente e Admin)
**Directory:** `ecommerce-admin-front` & `ecommerce-client-front`

1. **Dependências nos Frontends**:
   - Instalar `socket.io-client` em ambos os projetos.

2. **Admin Front - Escutar Novos Pedidos**:
   - No componente que renderiza a lista de pedidos (`OrdersList` ou similar), inicializar a conexão socket.
   - O socket deve se inscrever no evento `order.new` ou `order.created`.
   - Quando o evento for recebido, disparar um refresh na query (ex: `refetch()` do react-query) ou atualizar o estado local injetando o novo pedido no topo da tabela.

3. **Client Front - Escutar Atualizações de Estoque**:
   - Na lista de produtos/vitrine (`ProductsList`), inicializar a conexão socket.
   - Escutar o evento `product.stock_updated`.
   - Se o produto não tiver mais estoque (`stock === 0`), ocultar da visualização ou marcá-lo como "Esgotado".

4. **Limpeza**:
   - Garantir que no `useEffect` (ou equivalente no ciclo de vida do componente) ocorra a desconexão do socket (cleanup) para evitar memory leaks.
</plan>

<summary>
**O que será construído:**
Um módulo de WebSocket no backend NestJS que dispara eventos quando pedidos são feitos e estoques são alterados. O Admin reagirá mostrando o pedido instantaneamente, e o App de Cliente ocultará o produto da vitrine instantaneamente se ele acabar.
</summary>
