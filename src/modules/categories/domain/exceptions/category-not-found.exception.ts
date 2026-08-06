export class CategoryNotFoundError extends Error {
  constructor(id: string) {
    super(`Categoria com ID ${id} não encontrada.`);
    this.name = 'CategoryNotFoundError';
  }
}
