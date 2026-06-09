# Controle de Acesso por Tela

Sistema simples e visual para gerenciar quais perfis de usuário podem acessar cada tela do sistema.

## Como Configurar

### 1. Executar o Script SQL

Primeiro, execute o script SQL para criar a tabela de permissões e inserir os dados iniciais:

```bash
psql -U seu_usuario -d seu_banco -f sql/create_permissoes_telas.sql
```

Ou copie e execute o conteúdo do arquivo `sql/create_permissoes_telas.sql` diretamente no seu cliente PostgreSQL.

### 2. Acessar o Controle de Permissões

1. Faça login com um usuário **Admin**
2. No menu lateral, vá em **Configurações** → **Permissões**
3. Você verá uma lista de todas as telas do sistema

## Como Funciona

### Perfis de Usuário

O sistema possui 4 perfis:

- **Admin**: Sempre tem acesso total (não pode ser alterado)
- **Supervisor**: Acesso configurável
- **Operador**: Acesso configurável
- **Somente Leitura**: Acesso configurável

### Tipos de Permissão

Para cada tela, você pode definir:

- **Visualizar** 👁️: O usuário pode acessar e ver a tela
- **Editar** ✏️: O usuário pode fazer alterações (criar, editar, excluir)

**Importante**: Para habilitar "Editar", primeiro é necessário habilitar "Visualizar"

### Interface Visual

A interface mostra cards coloridos para cada perfil:
- **Vermelho**: Admin (bloqueado)
- **Roxo**: Supervisor
- **Azul**: Operador
- **Cinza**: Somente Leitura

Clique nos botões "Visualizar" ou "Editar" para ativar/desativar cada permissão.

## Telas Padrão Configuradas

O script SQL já inclui permissões padrão para as seguintes telas:

- Dashboard
- Tickets
- Solicitações
- Clientes
- WhatsApp
- Intranet
- Relatórios
- Configurações

## Comportamento Padrão

- **Admin**: Sempre tem acesso total a todas as telas
- **Supervisor**: Por padrão, tem acesso de visualização e edição à maioria das telas
- **Operador**: Por padrão, tem acesso de visualização e edição limitada
- **Somente Leitura**: Por padrão, apenas visualização

## Segurança

- Apenas usuários com perfil **Admin** podem acessar e modificar as permissões
- As permissões de Admin não podem ser alteradas pela interface
- Em caso de erro ao verificar permissões, o sistema permite acesso por segurança (evita bloquear usuários)

## Adicionar Nova Tela

Para adicionar uma nova tela ao controle de acesso:

```sql
-- Exemplo: Adicionar tela de "Backup"
INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'admin', '/painel/backup', 'Backup', TRUE, TRUE FROM empresas
ON CONFLICT DO NOTHING;

INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
SELECT id, 'supervisor', '/painel/backup', 'Backup', FALSE, FALSE FROM empresas
ON CONFLICT DO NOTHING;

-- Repetir para 'operador' e 'somente_leitura'
```

Ou use a API:

```typescript
POST /api/permissoes-telas
{
  "tela_rota": "/painel/backup",
  "tela_nome": "Backup"
}
```

## API Endpoints

### GET /api/permissoes-telas
Busca todas as permissões (apenas admin)

### POST /api/permissoes-telas
Cria permissões para uma nova tela (apenas admin)

### PATCH /api/permissoes-telas
Atualiza permissão específica (apenas admin)

**Body:**
```json
{
  "tela_rota": "/painel/tickets",
  "perfil": "operador",
  "pode_acessar": true,
  "pode_editar": false
}
```

## Verificação de Permissões no Código

Use a função helper para verificar permissões:

```typescript
import { verificarPermissao } from "@/lib/permissoes";

// Verificar se pode acessar
const podeAcessar = await verificarPermissao(
  empresaId,
  perfil,
  "/painel/tickets",
  "pode_acessar"
);

// Verificar se pode editar
const podeEditar = await verificarPermissao(
  empresaId,
  perfil,
  "/painel/tickets",
  "pode_editar"
);
```

## Suporte

Para dúvidas ou problemas, entre em contato com o suporte técnico.
