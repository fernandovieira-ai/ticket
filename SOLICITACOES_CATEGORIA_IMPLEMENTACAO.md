# Implementação de Categoria e Subcategoria em Solicitações Internas

## Resumo das Alterações

Foi adicionado suporte para categorização de solicitações internas no sistema. As alterações incluem:

### 1. Banco de Dados
- **Arquivo de migração**: [`migrate_solicitacoes_categoria.sql`](migrate_solicitacoes_categoria.sql)
- Adicionadas colunas `categoria_id` e `subcategoria_id` na tabela `solicitacoes_internas`
- Ambas referenciam a tabela `categorias` (estrutura hierárquica)
- Criados índices para performance
- Comentários de documentação adicionados

### 2. API Backend
- **Rota principal**: [`app/api/solicitacoes/route.ts`](app/api/solicitacoes/route.ts)
  - Schema de criação atualizado para incluir `categoria_id` e `subcategoria_id`
  - Query de listagem atualizada para retornar nomes das categorias
  - Query de criação atualizada para salvar as categorias

- **Rota de detalhes**: [`app/api/solicitacoes/[id]/route.ts`](app/api/solicitacoes/[id]/route.ts)
  - Schema de atualização ampliado
  - Query de detalhes retorna informações de categoria
  - Suporte a atualização de categorias via PATCH

### 3. Interface Frontend
- **Componente**: [`app/painel/solicitacoes/solicitacoes-client.tsx`](app/painel/solicitacoes/solicitacoes-client.tsx)
  - Adicionados campos de categoria e subcategoria no formulário
  - Implementada filtragem hierárquica (subcategorias dependem da categoria pai)
  - Colunas de categoria e subcategoria adicionadas na tabela de listagem
  - Validação e lógica de reset dos campos

## Estrutura Hierárquica

O sistema usa a tabela `categorias` com estrutura hierárquica:
- **Categoria Principal**: `parent_id = NULL`
- **Subcategoria**: `parent_id` aponta para a categoria pai

## Como Usar

### No formulário de criação:
1. Selecione o departamento destino
2. Escolha uma categoria principal
3. Se disponível, escolha uma subcategoria (campo será habilitado automaticamente)
4. Complete os demais campos e salve

### Na listagem:
- Novas colunas "Categoria" e "Subcategoria" exibem a classificação de cada solicitação
- Os filtros existentes continuam funcionando normalmente

## Execução da Migração

Execute o arquivo SQL no banco de dados:
```sql
-- Executar migrate_solicitacoes_categoria.sql
psql -d sua_base -f migrate_solicitacoes_categoria.sql
```

## Compatibilidade

- As alterações são **retrocompatíveis**
- Solicitações existentes continuarão funcionando normalmente
- Campos de categoria são opcionais

## Próximos Passos (Opcional)

1. Criar filtros específicos por categoria na interface
2. Relatórios por categoria
3. Configuração de SLA diferenciado por categoria
4. Auto-atribuição baseada em categoria

---

**Data**: 2026-05-04  
**Versão**: 1.0  
**Autor**: Claude Code Assistant  