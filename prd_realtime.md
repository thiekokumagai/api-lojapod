# Requisitos de Tempo Real para Pedidos e Estoque

1. **API**: 
   - Quando um cliente fizer um pedido, deve ser emitido um evento via WebSocket para notificar os clientes conectados (admin e frontend de clientes).

2. **Admin Cliente (Painel Administrativo)**: 
   - Atualizar a lista de pedidos em tempo real (real-time) assim que um novo pedido for feito.

3. **Front Cliente (E-commerce)**:
   - Atualizar a lista de produtos disponíveis em tempo real.
   - Caso um produto saia de estoque devido a um pedido recente, ele deve sumir (ou ser marcado como esgotado) no front-end imediatamente para evitar que outro cliente compre um item sem estoque.
