# AI Rules

## Tech stack

- **NestJS 11** is the application framework used for the backend API.
- **TypeScript** is the primary language for all application code.
- **Node.js** is the runtime environment for the server.
- **Prisma** is used as the ORM/database client via `@prisma/client` and `prisma`.
- **JWT authentication** is implemented with `@nestjs/jwt`, `@nestjs/passport`, and `passport-jwt`.
- **Passport** is the standard authentication middleware strategy layer.
- **class-validator** and **class-transformer** are used for DTO validation and transformation.
- **Swagger / OpenAPI** is provided through `@nestjs/swagger` and `swagger-ui-express` for API documentation.
- **Multer**, **Sharp**, and **MinIO** are used for file upload, image processing, and object storage workflows.
- **Jest** and **Supertest** are used for automated testing.

## Library usage rules

1. **Use NestJS patterns first**
   - Prefer NestJS modules, controllers, providers, guards, interceptors, and pipes over custom architectural patterns.
   - Keep code aligned with standard NestJS dependency injection and module boundaries.

2. **Use TypeScript for all source code**
   - Write all new application code in TypeScript.
   - Prefer explicit DTOs, interfaces, and typed return values over `any`.
   - Only use `any` when there is no reasonable typed alternative.

3. **Use Prisma for database access**
   - All database reads/writes should go through Prisma.
   - Do not write raw SQL unless there is a clear and necessary reason.
   - Keep database logic in services or dedicated Prisma-facing layers, not in controllers.

4. **Use DTOs with class-validator for input validation**
   - Validate request payloads with DTO classes using `class-validator`.
   - Use `class-transformer` when transformation is needed.
   - Do not validate request bodies manually inside controllers when DTO validation can handle it.

5. **Use NestJS auth libraries for authentication**
   - Use `@nestjs/jwt`, `passport`, `@nestjs/passport`, and `passport-jwt` for auth flows.
   - Put authentication and authorization logic in guards/strategies/services, not inline in controllers.
   - Use `bcrypt` for password hashing and verification.

6. **Use Swagger decorators for API documentation**
   - Document controllers and DTOs with `@nestjs/swagger` when exposing or changing endpoints.
   - Keep docs close to the route and schema definitions.

7. **Use Multer, Sharp, and MinIO only for file/media workflows**
   - Use `multer` for multipart upload handling.
   - Use `sharp` for image processing.
   - Use `minio` for object storage interactions.
   - Do not introduce other upload or image libraries unless there is a strong reason.

8. **Use Jest and Supertest for tests**
   - Use **Jest** for unit and integration tests.
   - Use **Supertest** for HTTP/e2e endpoint testing.
   - Do not introduce a second test framework.

9. **Use built-in NestJS/RxJS capabilities before adding dependencies**
   - Prefer NestJS and existing project dependencies over adding new libraries.
   - Only add a new package if the needed capability is not already covered by NestJS, Prisma, or current dependencies.

10. **Keep concerns separated**
    - Controllers should handle HTTP concerns.
    - Services should contain business logic.
    - DTOs should define and validate request/response shapes.
    - Guards/strategies should handle auth concerns.
    - Persistence logic should stay close to Prisma usage.

## Practical implementation rules

- Place route handlers in **controllers**.
- Place business logic in **services**.
- Group related features into **modules**.
- Prefer small, focused providers over large multi-purpose services.
- Reuse existing dependencies before introducing alternatives.
- Avoid duplicate utility layers when NestJS already provides the feature.
- Keep API contracts typed and validated.
- Update Swagger metadata when changing public endpoints.

## Regras de Idioma e Planejamento (.planning)

1. **Idioma Obrigatório**: Todos os documentos de planejamento na pasta `.planning/` (incluindo `PROJECT.md`, `ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md`, planos de fase, históricos e arquivos de contexto) devem ser escritos exclusivamente em **Português Brasileiro (pt-BR)**.
2. **Criação e Atualizações**: Qualquer novo arquivo de planejamento ou alteração em arquivos existentes criada por assistentes de IA deve seguir essa diretriz de idioma estritamente.
3. **Comentários de Código**: Prefira escrever novos comentários de código explicativos e mensagens de commit em Português Brasileiro (pt-BR), mantendo coerência com a documentação do projeto.
4. **Commits (Conventional Commits)**: Toda vez que finalizar uma phase (no frontend ou backend), deve ser feito um commit seguindo estritamente as regras de *Conventional Commits*:
   - `feat`: Nova funcionalidade
   - `fix`: Correção de bug
   - `refactor`: Refatoração sem alterar comportamento
   - `style`: Formatação, lint, espaços
   - `docs`: Documentação
   - `test`: Testes
   - `chore`: Tarefa técnica/manutenção
   - `perf`: Melhoria de performance
   - `build`: Build/dependências
   - `ci`: Pipeline/CI/CD
   - `revert`: Reverter commit
