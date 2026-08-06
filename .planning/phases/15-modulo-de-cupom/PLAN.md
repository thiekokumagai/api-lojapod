# Phase 15: Módulo de Cupom

## Visão Geral
Este documento detalha as mudanças e adições realizadas na implementação do Módulo de Cupons em ambas as aplicações (Backend, Admin Frontend e Client Frontend).

## Alterações no Backend (ecommerce-api)
- **Banco de Dados**: Criação do modelo `Coupon` contendo campos como `title`, `status`, `type` (VALUE, PERCENTAGE, FREE_SHIPPING), `validUntilDate`, `startTime`, `endTime`, `maxUses`, `currentUses`, `minOrderValue`, e `applyToPromotionalItems`. Também foi adicionada a relação `couponId` na tabela `Order`.
- **Nova Estrutura (Clean Architecture)**: O módulo `CouponsModule` foi adicionado e as respectivas entidades de Domínio, Repositórios de Infraestrutura e Casos de Uso (`Create`, `Update`, `List`, `ToggleStatus`, e `ValidateCoupon`) foram implementados.
- **Integração na Criação de Pedidos**: O caso de uso `CreateOrderUseCase` foi atualizado para validar o cupom fornecido e atualizar a contagem de usos `currentUses` na mesma transação que cria o pedido.

## Alterações no Frontend Administrativo (ecommerce-admin-front)
- **Camada de Serviço e Hooks**: Criado o cliente de API e hooks em React Query (`useCoupons`) para listar, criar e atualizar cupons.
- **Página de Cupons**: Adicionada a `CouponsPage` permitindo que os administradores ativem/desativem e visualizem o detalhe dos cupons.
- **Modal de Formulário**: Adicionado `CouponFormModal` com o formulário e interface de usabilidade para configurar todos os limites, regras de negócio e tipos do cupom.

## Alterações no Frontend do Cliente (ecommerce-client-front)
- **Integração de Validação**: Criado o hook `useValidateCoupon.ts` que se conecta com a rota do backend `/coupons/validate` garantindo regras em tempo real para os clientes.
- **Painel de Compra (CartSidebar)**: O checkout principal no carrinho foi atualizado para conter inputs de código de cupom. Em caso de sucesso de validação, os valores subtotais, a taxa de entrega e o valor final sofrem redução ou indicação de "Frete Grátis".
- **Comunicação por WhatsApp**: A string gerada para confirmação do pedido pelo lojista via WhatsApp passa a descrever exatamente qual cupom foi usado, o tipo e a economia gerada no momento da compra.

## Conclusão
O ciclo de desenvolvimento para a fase 15 foi concluído com sucesso preenchendo todos os requisitos operacionais para aplicação de cupons, desde o banco de dados até as notificações ao cliente via chat.
