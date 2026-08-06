# Phase 12: Pedidos pagos irem para o caixa admin e api - Research

## Context Analysis
- **Goal**: Implement the Cash Register ("Caixa") feature that tracks and sums paid orders within specific time periods.
- **Current State**: The `Order` model uses `updatedAt` for many things, but lacks an explicit `paymentDate` field. The `PaymentStatus` is toggled by `ReceiveOrderUseCase`.
- **Database**: Prisma ORM, PostgreSQL.

## Architecture Investigation

### Backend (ecommerce-api)
1. **Prisma Schema (`prisma/schema.prisma`)**:
   - Needs a `CashRegister` model with `id`, `title`, `startDate`, `endDate`, `createdAt`, `updatedAt`.
   - The `Order` model needs a `paymentDate DateTime?` field to reliably associate the order's payment event with a Cash Register's date range.
2. **Orders Module**:
   - `ReceiveOrderUseCase` must be updated to set `paymentDate = new Date()` when the payment is confirmed.
   - `RevertReceiveOrderUseCase` must clear `paymentDate = null`.
3. **Cash Registers Module**:
   - Needs `create`, `update`, `delete`, `findAll`, and `getSummary(id)` endpoints.
   - `getSummary(id)` should load the `CashRegister` and then perform an aggregation/query on `Order` where `paymentStatus = PAID` and `paymentDate` is between `CashRegister.startDate` and `CashRegister.endDate`.

### Frontend (ecommerce-admin-front)
1. **Navigation**: `/caixa` already exists in `admin-nav.ts` but the page/component might be missing or incomplete.
2. **Views**:
   - **List View**: A table listing all cash registers (Month, Start Date, End Date).
   - **Form/Modal**: To create/edit a cash register.
   - **Details/Summary View**: A dashboard showing the Total Received for that cash register, broken down by `paymentMethod`, and a table listing all the specific `Orders` that were included in that sum.

## Validation Architecture
- **API Tests**: Unit tests for the new CashRegisters module and its use cases. E2E tests for the new endpoints.
- **Frontend**: Make sure date range queries correctly use ISO date formats to prevent timezone bugs when matching orders to cash registers.
- **Schema Push**: A database schema push will be REQUIRED since `CashRegister` model and `Order.paymentDate` are being added to `schema.prisma`.

## Conclusion
The implementation is straightforward. By adding `paymentDate` to orders, we keep the coupling loose—Orders don't need a strict foreign key to `CashRegister`; the Cash Register just acts as a time-bounded lens over the Orders. This perfectly aligns with the context decision: "Somente recebimentos/pedidos pagos que ocorrerem entre a startDate e a endDate serão contabilizados no caixa respectivo."
