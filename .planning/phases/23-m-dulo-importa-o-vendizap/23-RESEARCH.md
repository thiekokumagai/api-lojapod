# Phase 23: Módulo importação vendizap - Research

## Objective
Identify how to implement the "Vendizap Import" feature across the Backend API and the Admin Frontend without breaking existing functionality, addressing schema modifications, integration points, and external storage logic for images.

## 1. Schema Analysis (Prisma)
The database models currently exist as follows (`prisma/schema.prisma`):
- `Category`: Already has an `externalId String? @unique`.
- `Product`: Missing an external identifier. Must add `externalId String? @unique`.
- `Order`: Missing an external identifier. Must add `externalId String? @unique`.
- `Variation` and `VariationOption`: Variations need external identifiers to correctly sync options (e.g. Size, Color) from Vendizap without recreating them on every import.
- `Customer`: Orders from Vendizap will likely come with customer information. The Customer module (Phase 22) creates/links customers by `phone`. We should reuse this logic.

## 2. Vendizap API Integration Requirements
- **Auth**: Needs `X-Auth-Id` and `X-Auth-Secret` headers for every request.
- **Endpoints**:
  - `GET /categories` - Contains category details and image URLs.
  - `GET /products` - Contains products, prices, and attached images, as well as variation IDs.
  - `GET /variations` - Contains variations and options.
  - `GET /orders` - Contains orders and their item details.
- **Image Uploads**: The requirement specifies that images provided as URLs from Vendizap must be downloaded and uploaded to our own storage (e.g., R2/Cloudflare). We must ensure the backend has a utility to download an image from a URL, create a buffer, and push it to the current cloud storage service, replacing the Vendizap URL with our own CDN URL before saving to the DB.

## 3. Backend Architecture (Clean Architecture)
To keep with the modular Clean Architecture (REQ-01, REQ-02, REQ-04):
- We should create a new isolated module: `src/modules/imports/`.
- **Domain**: Define interfaces like `IVendizapService`.
- **Use Cases**: `ImportCategoriesUseCase`, `ImportProductsUseCase`, `ImportOrdersUseCase`.
  - These use cases will need to interact with the existing repositories (e.g., `ICategoriesRepository`, `IProductsRepository`, `IOrdersRepository`) to `upsert` data based on `externalId`.
- **Infrastructure**: Implement the `VendizapService` that makes HTTP requests (e.g., using `axios` or NestJS `HttpModule`) with the required Auth headers. Create Controllers for the Admin panel to trigger these imports (e.g., `POST /imports/vendizap/categories`).

## 4. Frontend (Admin Panel)
- **Module/Page**: Create a new page `ImportsPage.tsx`.
- **Sections**: Tabs or separate cards for "Categorias", "Produtos", "Pedidos".
- **Interaction**: Provide buttons to trigger the import. Since imports can be long-running (especially with image downloads), the API should either return a stream/progress, or the frontend can show a loading state with a spinner while waiting.
- **Error Handling**: Present clear feedback if the import fails or succeeds.

## 5. Potential Pitfalls and Gaps
- **Timeouts**: Importing hundreds of products and downloading their images synchronously might cause an HTTP timeout. Batch processing is recommended.
- **Data Integrity**: The UPSERT operation is crucial to allow retries safely.
- **Stock Tracking**: Imported orders need to either decrement stock or bypass stock logic if they are historical orders.
- **Variations Syncing**: We need to be careful when UPSERTING variations to avoid creating duplicates of the same option text.

## 6. Validation Architecture (Nyquist)
- Test if the schema pushes successfully after adding `externalId` fields.
- Test if `VendizapService` can successfully authenticate and fetch data.
- Test if image downloader successfully streams the URL to the R2 bucket.
- Test the upsert logic ensures no duplicate categories/products are created on repeated imports.
