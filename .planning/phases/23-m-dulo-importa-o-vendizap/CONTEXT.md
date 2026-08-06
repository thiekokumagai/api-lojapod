# Contexto: Módulo Importação Vendizap

O objetivo desta fase é criar um módulo de importação no painel de administração para integrar dados do Vendizap.

## Documentação da API
- **Documentação completa**: [Postman Documenter](https://documenter.getpostman.com/view/30601988/2sA2xfXD2T)
- **Categorias**: [Endpoint de Categorias](https://documenter.getpostman.com/view/30601988/2sA2xfXD2T#5f6d1fca-9010-481a-934e-3bfbfd48156f)
- **Produtos**: [Endpoint de Produtos](https://documenter.getpostman.com/view/30601988/2sA2xfXD2T#695a2a8a-afe1-4060-9096-a76d74d22019)
- **Pedidos**: [Endpoint de Pedidos](https://documenter.getpostman.com/view/30601988/2sA2xfXD2T#eaa5c33c-3124-469c-99a0-f6f32876bb93)
- **Variações de Produtos**: [Endpoint de Variações](https://documenter.getpostman.com/view/30601988/2sA2xfXD2T#b5b9a949-16b2-4cdf-a471-46a4dc3d12b4)

## Credenciais
As requisições para a API do Vendizap devem usar os seguintes headers de autenticação:
- `X-Auth-Id`: `906795`
- `X-Auth-Secret`: `GHMla7Nebr#uITLn0jA9tCy?FJx%UBh1`

## Requisitos
1. **Painel Admin**:
   - Criar um módulo "Importações".
   - Dividir o módulo em seções separadas para cada tipo de importação (Categorias, Produtos, Pedidos, etc.).
2. **Regras de Negócio / Integração**:
   - Seguir as regras e formatos estabelecidos na documentação da API.
   - Fazer upload de todas as imagens associadas (produtos, categorias, etc.) para o sistema interno (provavelmente via R2/Cloudflare ou provedor de storage atual).
3. **Banco de Dados**:
   - Adicionar um campo de `external_id` (ou equivalente) nas entidades de `Produto`, `Categoria` e `Pedido` para identificar e referenciar os registros importados, evitando duplicações e permitindo atualizações.
4. **Variações de Produto**:
   - Produtos possuem variações (tamanho, cor, etc.) que devem ser corretamente extraídas da API e cadastradas no sistema.
5. **Abordagem Arquitetural**:
   - Utilizar as melhores práticas para construir essa importação (processamento em batch se necessário, tratamento de erros, feedbacks visuais de progresso no admin).
