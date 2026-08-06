# Contexto — Fase 6: Implementação do Módulo de Configurações (StoreSettings)

Este documento define os requisitos técnicos para a implementação do módulo de **Configurações** (`StoreSettings`) na API (`ecommerce-core-api`) seguindo estritamente o padrão da **Clean Architecture Modular**.

---

## 📋 Requisitos de Banco de Dados (Prisma Schema)

Criaremos o modelo `StoreSettings` no banco de dados PostgreSQL. Ele funcionará como um singleton (onde geralmente existirá apenas um registro para o painel principal, mas projetado de forma robusta).

```prisma
model StoreSettings {
  id                      String   @id @default(uuid())
  storeName               String   @default("Minha Loja")
  logoUrl                 String?
  faviconUrl              String?
  topHeaderText           String?
  bannerUrls              String[] // Array de strings (até 7 banners)
  phone                   String   @default("")
  instagram               String?
  
  // Endereço
  cep                     String   @default("")
  street                  String   @default("")
  number                  String   @default("")
  neighborhood            String   @default("")
  city                    String   @default("")
  state                   String   @default("")
  complement              String?
  hideAddress             Boolean  @default(false)
  
  // Pagamentos
  pixEnabled              Boolean  @default(false)
  pixKeyType              String?  // 'CPF_CNPJ' | 'EMAIL' | 'PHONE'
  pixKey                  String?
  pixHolder               String?
  
  payOnDeliveryCash       Boolean  @default(false)
  payOnDeliveryCardDebit  Boolean  @default(false)
  payOnDeliveryCardCredit Boolean  @default(false)
  
  // Descontos/Taxas adicionais salvos como JSON para flexibilidade
  paymentRules            Json?    // Array de regras dinâmicas
  
  createdAt               DateTime @default(now())
  updatedAt               DateTime @updatedAt

  @@map("store_settings")
}
```

---

## 🧩 Arquitetura do Módulo (`src/modules/settings`)

Devemos seguir a mesma estrutura Clean Architecture modularizada utilizada nos módulos refatorados de `categories` e `products`:

### 1. Camada de Domínio (`domain/`)
- **Entities**:
  - `store-settings.entity.ts`: Representação em memória pura da entidade de configurações.
- **Repositories**:
  - `isettings.repository.ts`: Interface declarando as operações de busca e salvamento:
    - `get(): Promise<StoreSettings | null>`
    - `save(settings: StoreSettings): Promise<StoreSettings>`
- **Use Cases**:
  - `get-settings.use-case.ts`: Caso de uso para retornar as configurações (criando as configurações padrão caso a tabela esteja vazia).
  - `update-settings.use-case.ts`: Caso de uso para atualizar as configurações existentes de forma atômica.

### 2. Camada de Infraestrutura (`infrastructure/`)
- **Controllers**:
  - `settings.controller.ts`:
    - `GET /settings`: Chama o `GetSettingsUseCase`.
    - `PUT /settings`: Aceita `UpdateSettingsDto` e chama o `UpdateSettingsUseCase`.
    - `POST /settings/upload`: Endpoint para upload no MinIO e retorno da URL pública.
- **Database (Adapters)**:
  - `prisma-settings.repository.ts`: Implementa `ISettingsRepository` injetando o `PrismaService`.
- **DTOs**:
  - `update-settings.dto.ts`: Validações de entrada via `class-validator`.

---

## 📦 Integração com Módulo de Upload (MinIO)

A API possui suporte para upload de imagens integrado com MinIO. Reutilizaremos o `StorageService` (se disponível) ou implementaremos uma lógica consistente para processamento e salvamento de logo, favicon e os banners, garantindo que as imagens antigas sejam opcionalmente limpas se substituídas.
