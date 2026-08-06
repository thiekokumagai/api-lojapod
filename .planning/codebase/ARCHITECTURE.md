# Arquitetura Limpa Modular (Modular Clean Architecture)

Este documento estabelece as diretrizes arquiteturais, divisão de responsabilidades e padrões de código para o projeto \`ecommerce-core-api\`. Toda nova funcionalidade ou refatoração deve obedecer estritamente a estas regras para manter a base de código desacoplada, testável e manutenível.

---

## 1. Princípios Gerais da Arquitetura

A Arquitetura Limpa baseia-se na **Regra da Dependência**: as dependências de código devem apontar apenas para dentro. O código das camadas internas (Domínio) não pode saber nada sobre as camadas externas (Banco de Dados, HTTP, Frameworks).

```
  ┌─────────────────────────────────────────────────────────────┐
  │                   INFRAESTRUTURA (Externo)                  │
  │     (NestJS Controllers, DTOs, Prisma ORM, Swagger, MinIO)  │
  │                                                             │
  │        ┌──────────────────────────────────────────────┐     │
  │        │             APLICAÇÃO (Casos de Uso)         │     │
  │        │          (Interatores, Portas/Contratos)     │     │
  │        │                                              │     │
  │        │        ┌──────────────────────────────┐      │     │
  │        │        │        DOMÍNIO (Interno)     │      │     │
  │        │        │     (Entidades de Negócio)   │      │     │
  │        │        └──────────────────────────────┘      │     │
  │        └──────────────────────────────────────────────┘     │
  └─────────────────────────────────────────────────────────────┘
```

---

## 2. Divisão de Responsabilidades por Camada

Cada módulo da aplicação (ex: \`categories\`, \`products\`) deve ser estruturado em duas grandes pastas: \`domain\` (interno) e \`infrastructure\` (externo).

### Camada de Domínio e Aplicação (\`src/modules/[modulo]/domain/\`)
Esta camada contém o núcleo inteligente da aplicação. É escrita em **TypeScript Puro**, sem nenhuma dependência de NestJS, Prisma, ou decorações de validação.

* **Entidades (\`domain/entities/\`)**:
  * Classes ou interfaces que representam os modelos de negócio do domínio (ex: \`Category\`, \`Product\`).
  * Não possuem decorações de banco de dados (ex: Prisma/TypeORM) nem decorações de validação de API.
  * Devem conter validações de consistência de estado interna caso necessário.

* **Contratos dos Repositórios (\`domain/repositories/\`)**:
  * Interfaces TypeScript (Portas) que definem os métodos necessários para a persistência dos dados (ex: \`ICategoriesRepository\`).
  * Desacoplam os Casos de Uso das queries do banco de dados.

* **Casos de Uso / Interatores (\`domain/use-cases/\`)**:
  * Classes puras que representam uma ação específica que o usuário ou sistema pode tomar (ex: \`CreateCategoryUseCase\`, \`ListCategoriesUseCase\`).
  * Cada caso de uso deve ter **uma única responsabilidade** e expor um único método público (normalmente \`execute()\`).
  * Recebem suas dependências (como repositórios e serviços externos) no construtor através de injeção de dependência por interfaces.

---

### Camada de Infraestrutura (\`src/modules/[modulo]/infrastructure/\`)
Esta camada gerencia todos os detalhes de frameworks, entrega de dados e comunicação externa. Ela implementa e consome as portas do domínio.

* **Controladores (\`infrastructure/controllers/\`)**:
  * Controllers tradicionais do NestJS com rotas HTTP (\`@Get()\`, \`@Post()\`, etc.) e decorações do Swagger (\`@ApiOperation()\`, \`@ApiResponse()\`).
  * Sua única função é receber a requisição HTTP, extrair os dados dos DTOs, chamar o Use Case apropriado, e retornar o resultado HTTP correspondente.
  * **Zero regras de negócio são permitidas aqui.**

* **Banco de Dados / Repositórios (\`infrastructure/database/\`)**:
  * Contém a implementação concreta das portas de repositórios definidas no domínio (ex: \`PrismaCategoriesRepository\`).
  * Utiliza o PrismaClient (\`PrismaService\`) para executar as queries do PostgreSQL.
  * Responsável por mapear as entidades de banco (geradas pelo Prisma) para as entidades puras de domínio TypeScript.

* **DTOs (\`infrastructure/dtos/\`)**:
  * Objetos de Transferência de Dados (\`Data Transfer Objects\`) que definem o formato exato das cargas de requisição de entrada e saída.
  * Contêm as decorações do \`class-validator\` (ex: \`@IsString()\`, \`@IsNotEmpty()\`) e as decorações do Swagger (\`@ApiProperty()\`).

---

## 3. Injeção de Dependências no NestJS

Como as interfaces TypeScript não existem em tempo de execução, o NestJS não pode usá-las diretamente para injeção de dependências. Adotamos o seguinte padrão para manter o desacoplamento:

### Passo A: Definição da Interface e do Token de String
Ao criar a interface do repositório no domínio, exportamos também uma constante com um token de string:

```typescript
// src/modules/categories/domain/repositories/icategories.repository.ts

export interface ICategoriesRepository {
  findById(id: string): Promise<Category | null>;
  create(category: Omit<Category, 'id' | 'createdAt'>): Promise<Category>;
  // ... outros métodos
}

// Token para injeção do NestJS em tempo de execução
export const ICategoriesRepositoryToken = 'ICategoriesRepository';
```

### Passo B: Injeção no Use Case (Domínio)
O Caso de Uso injeta o repositório no seu construtor usando o token de string:

```typescript
// src/modules/categories/domain/use-cases/create-category.use-case.ts
import { Inject, Injectable } from '@nestjs/common';
import { ICategoriesRepository, ICategoriesRepositoryToken } from '../repositories/icategories.repository';

@Injectable()
export class CreateCategoryUseCase {
  constructor(
    @Inject(ICategoriesRepositoryToken)
    private readonly categoriesRepository: ICategoriesRepository,
  ) {}

  async execute(input: CreateCategoryInput): Promise<Category> {
    // Lógica de negócios pura
    return this.categoriesRepository.create(input);
  }
}
```

### Passo C: Configuração no Módulo (Infraestrutura)
No arquivo de módulo do NestJS, associamos a implementação concreta (Prisma) ao token de string:

```typescript
// src/modules/categories/categories.module.ts
import { Module } from '@nestjs/common';
import { CategoriesController } from './infrastructure/controllers/categories.controller';
import { PrismaCategoriesRepository } from './infrastructure/database/prisma-categories.repository';
import { ICategoriesRepositoryToken } from './domain/repositories/icategories.repository';
import { CreateCategoryUseCase } from './domain/use-cases/create-category.use-case';

@Module({
  controllers: [CategoriesController],
  providers: [
    // Registro dos Casos de Uso
    CreateCategoryUseCase,
    
    // Injeção do repositório associando o Token de Domínio à classe de Infraestrutura Prisma
    {
      provide: ICategoriesRepositoryToken,
      useClass: PrismaCategoriesRepository,
    },
  ],
  exports: [ICategoriesRepositoryToken], // Permite reuso em outros módulos
})
export class CategoriesModule {}
```

---

## 4. Fluxo de Tratamento de Erros de Domínio

Para evitar que a camada de domínio lance exceções específicas do HTTP (como \`NotFoundException\` do NestJS), o domínio deve lançar exceções de negócios puras:

1. **Definição do Erro no Domínio**:
   ```typescript
   export class CategoryNotFoundError extends Error {
     constructor(id: string) {
       super(`Categoria com ID ${id} não encontrada.`);
       this.name = 'CategoryNotFoundError';
     }
   }
   ```
2. **Tratamento no Exception Filter (Infraestrutura)**:
   Criamos um Exception Filter global ou por módulo no NestJS que intercepta os erros do domínio e os converte no código de status HTTP apropriado:
   * \`CategoryNotFoundError\` -> \`404 Not Found\`
   * \`InvalidStockOperationError\` -> \`400 Bad Request\`
   * Erros desconhecidos -> \`500 Internal Server Error\`

Isso mantém o domínio limpo e a API HTTP padronizada.
