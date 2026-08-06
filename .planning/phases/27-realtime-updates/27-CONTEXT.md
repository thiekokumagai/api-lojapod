# Phase 27: Atualizações em Tempo Real (Websockets) - Context

**Status:** Ready for planning
**Source:** User Request

<domain>
## Phase Boundary

Implementação de WebSockets para notificação em tempo real entre a API e as aplicações cliente (Admin e Client Front). O objetivo principal é garantir que a listagem de pedidos do admin seja atualizada imediatamente quando um novo pedido for feito, e que a listagem de produtos do front cliente seja atualizada caso um produto saia de estoque, prevenindo a venda de itens esgotados.
</domain>

<decisions>
## Implementation Decisions

### Websocket Setup
- Utilizar a biblioteca `@nestjs/platform-socket.io` e `@nestjs/websockets` na `ecommerce-api`.
- Configurar um Gateway de Websocket no backend (ex: `EventsGateway` ou `OrdersGateway` e `ProductsGateway`).

### Eventos de Pedido (Admin)
- Quando o use case de Criação de Pedido (`CreateOrderUseCase`) processar um pedido com sucesso, o backend deve emitir um evento (ex: `order.created`).
- O `ecommerce-admin-front` deve escutar este evento para dar um refresh na lista de pedidos ou inserir o novo pedido no estado atual da lista.

### Eventos de Estoque/Produto (Client)
- Quando o estoque de um produto chegar a zero devido a um pedido, o backend deve emitir um evento (ex: `product.out_of_stock` ou `product.stock_updated` contendo a nova disponibilidade).
- O `ecommerce-client-front` deve escutar este evento para remover o produto da interface de vitrine (ou marcá-lo como "Esgotado").

### the agent's Discretion
- A escolha exata dos nomes de eventos e da arquitetura do Gateway (único ou segmentado) fica a critério da implementação, mas deve seguir as práticas do NestJS (Clean Architecture onde aplicável).
- O frontend usará `socket.io-client` para a comunicação com a API.
</decisions>

<canonical_refs>
## Canonical References

No external specs — requirements fully captured in decisions above.
</canonical_refs>

<specifics>
## Specific Ideas

- Necessário validar a porta ou namespace do WebSocket.
- Caso o socket sofra desconexão, o client deverá tentar reconexão automática e, opcionalmente, dar um resync.
</specifics>

<deferred>
## Deferred Ideas

- Notificações push ou e-mails em tempo real.
- Mensageria pesada via RabbitMQ ou Kafka (o escopo é WebSocket simples com Socket.io por enquanto).
</deferred>

---
*Phase: 27-realtime-updates*
