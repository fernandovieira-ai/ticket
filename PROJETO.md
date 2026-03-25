# PROJETO.md — DigitalRF Help
# Arquivo de contexto para Claude Code — carregar no início de cada sessão

---

## Identidade do projeto
- **Nome**: DigitalRF Help
- **Empresa**: DigitalRF (digitalrf.com.br)
- **Tipo**: Plataforma de Chamados & Tickets com IA e WhatsApp
- **Repositório**: digitalrf-help
- **Deploy**: Railway
- **Versão atual**: 0.1.0 (Sprint 1 em andamento)

---

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Estilização | Tailwind CSS + shadcn/ui |
| Banco | PostgreSQL (Railway) |
| ORM/Query | `pg` com queries SQL raw (padrão do ERP emsys3) |
| Auth | JWT (jose) + httpOnly cookie + refresh token |
| Validação | Zod |
| Upload | Cloudflare R2 |
| E-mail | Resend |
| WhatsApp | Evolution API (self-hosted) ou Z-API |
| IA | Claude API (claude-sonnet-4-20250514) via Anthropic SDK |
| Deploy | Railway (mesmo workspace do ERP) |

---

## Variáveis de ambiente (.env.local)

```env
# Banco
DATABASE_URL=postgresql://user:pass@host:5432/chamados_db

# Auth
JWT_SECRET=
JWT_REFRESH_SECRET=
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Storage
R2_BUCKET=
R2_ACCESS_KEY=
R2_SECRET_KEY=
R2_ENDPOINT=

# E-mail
RESEND_API_KEY=

# WhatsApp
WHATSAPP_PROVIDER=evolution  # 'evolution' | 'zapi'
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=
EVOLUTION_INSTANCE=digitalrf
ZAPI_INSTANCE_ID=         # alternativa: Z-API
ZAPI_TOKEN=

# IA — Claude
ANTHROPIC_API_KEY=
AI_MODEL=claude-sonnet-4-20250514
AI_MAX_TOKENS=1024
```

---

## Estrutura de pastas

```
/app
  /(auth)
    /login                  → login operador/admin
    /cliente/login          → login portal cliente
  /(painel)                 → layout operadores (sidebar two-panel)
    /dashboard              → visão geral + métricas
    /tickets                → lista + detalhe
    /tickets/[id]
    /clientes               → CRM
    /clientes/[id]
    /solicitacoes           → solicitações internas
    /relatorios
    /configuracoes
      /geral
      /sla
      /categorias
      /usuarios
      /whatsapp             → configuração do canal WhatsApp
      /ia                   → configuração dos prompts de IA
  /(portal)                 → layout clientes
    /meus-tickets
    /novo-ticket
    /base-conhecimento
  /api
    /auth/[...route]        → login, logout, refresh
    /tickets/[...route]
    /clientes/[...route]
    /whatsapp/webhook       → recebe mensagens do WhatsApp
    /ia/sugerir             → sugestões de resposta
    /ia/classificar         → classifica ticket automaticamente
    /ia/resumir             → resume histórico do ticket
    /notificacoes

/components
  /layout
    sidebar.tsx             → two-panel sidebar retrátil
    header.tsx
  /tickets
    ticket-card.tsx
    ticket-detalhe.tsx
    status-badge.tsx
    sla-badge.tsx
  /ia
    sugestao-resposta.tsx   → painel IA dentro do ticket
    classificacao-ia.tsx
  /whatsapp
    chat-preview.tsx        → preview do histórico WhatsApp
    status-conexao.tsx

/lib
  db.ts                     → pool PostgreSQL
  auth.ts                   → JWT helpers
  sla.ts                    → cálculo de prazos SLA
  whatsapp.ts               → cliente Evolution API / Z-API
  ia.ts                     → cliente Anthropic + prompts
  email.ts                  → Resend helpers
  upload.ts                 → Cloudflare R2

/types
  index.ts                  → tipos TypeScript (espelho do schema SQL)
```

---

## Schema do banco

Arquivo: `chamados_schema.sql` (já executado no banco)

### Tabelas principais
```
empresas, departamentos, usuarios, log_acessos
clientes, contatos_cliente, inventario_cliente
categorias, sla_config, horario_comercial
tickets, mensagens, anexos_ticket, anexos_mensagem
sla_logs, pesquisa_satisfacao
solicitacoes_internas, mensagens_solicitacao
kb_categorias, kb_artigos
notificacoes, email_templates
regras_atribuicao
campos_extras_ticket, valores_campos_ticket
```

### Tabelas WhatsApp (adicionar ao schema)
```sql
-- Sessões/instâncias WhatsApp por empresa
CREATE TABLE whatsapp_instancias (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id),
  nome_instancia  VARCHAR(100) NOT NULL,
  numero          VARCHAR(20),
  provider        VARCHAR(20) NOT NULL DEFAULT 'evolution',
  status          VARCHAR(20) NOT NULL DEFAULT 'desconectado',
  qr_code         TEXT,
  webhook_url     TEXT,
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contatos do WhatsApp vinculados a clientes
CREATE TABLE whatsapp_contatos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id  UUID NOT NULL REFERENCES empresas(id),
  cliente_id  UUID REFERENCES clientes(id) ON DELETE SET NULL,
  numero      VARCHAR(20) NOT NULL,  -- ex: 5534999990000
  nome        VARCHAR(150),
  avatar_url  TEXT,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(empresa_id, numero)
);

-- Mensagens WhatsApp (histórico completo)
CREATE TABLE whatsapp_mensagens (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id),
  ticket_id       UUID REFERENCES tickets(id) ON DELETE SET NULL,
  contato_id      UUID REFERENCES whatsapp_contatos(id),
  message_id      VARCHAR(100),     -- ID da mensagem no WhatsApp
  direcao         VARCHAR(10) NOT NULL, -- 'entrada' | 'saida'
  tipo            VARCHAR(20) NOT NULL DEFAULT 'texto', -- texto, imagem, audio, doc
  corpo           TEXT,
  midia_url       TEXT,
  status          VARCHAR(20) DEFAULT 'recebida', -- recebida, lida, enviada, falha
  enviada_por_ia  BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wp_mensagens_ticket ON whatsapp_mensagens(ticket_id);
CREATE INDEX idx_wp_mensagens_contato ON whatsapp_mensagens(contato_id);

-- Configuração de automação WhatsApp por empresa
CREATE TABLE whatsapp_config (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id            UUID NOT NULL REFERENCES empresas(id),
  -- Horário de atendimento humano
  horario_bot_inicio    TIME DEFAULT '00:00',
  horario_bot_fim       TIME DEFAULT '23:59',
  -- Mensagens automáticas
  msg_boas_vindas       TEXT,
  msg_fora_horario      TEXT,
  msg_ticket_criado     TEXT,  -- ex: "Seu ticket #{{numero}} foi aberto!"
  msg_ticket_respondido TEXT,
  -- IA
  ia_ativa              BOOLEAN NOT NULL DEFAULT FALSE,
  ia_modo               VARCHAR(20) DEFAULT 'sugestao', -- 'sugestao' | 'autonomo'
  ia_prompt_sistema     TEXT,
  -- Ticket automático
  criar_ticket_auto     BOOLEAN NOT NULL DEFAULT TRUE,
  categoria_padrao_id   UUID REFERENCES categorias(id),
  UNIQUE(empresa_id)
);

-- Logs de IA (auditoria de todas as chamadas)
CREATE TABLE ia_logs (
  id              BIGSERIAL PRIMARY KEY,
  empresa_id      UUID NOT NULL REFERENCES empresas(id),
  ticket_id       UUID REFERENCES tickets(id),
  tipo            VARCHAR(40) NOT NULL, -- 'sugestao_resposta','classificacao','resumo','whatsapp_bot'
  prompt          TEXT,
  resposta        TEXT,
  tokens_entrada  INTEGER,
  tokens_saida    INTEGER,
  latencia_ms     INTEGER,
  usado           BOOLEAN DEFAULT FALSE,  -- operador usou a sugestão?
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ia_logs_ticket ON ia_logs(ticket_id);
CREATE INDEX idx_ia_logs_empresa ON ia_logs(empresa_id, criado_em DESC);
```

---

## Módulo WhatsApp

### Funcionamento geral
```
Cliente envia mensagem WhatsApp
        ↓
Evolution API / Z-API recebe
        ↓
POST /api/whatsapp/webhook
        ↓
┌─────────────────────────────────────┐
│  Identifica contato (pelo número)   │
│  Vincula ao cliente no CRM          │
│  Cria ou reabre ticket              │
│  Salva mensagem em whatsapp_mensagens│
└─────────────────────────────────────┘
        ↓
   [IA ativa?]
   Sim → gera resposta sugerida ou responde automaticamente
   Não → notifica agente responsável no painel
        ↓
Agente responde no painel → mensagem enviada via API para o WhatsApp
```

### Modos de operação da IA no WhatsApp
- **Modo sugestão**: IA gera resposta, agente revisa e envia com 1 clique
- **Modo autônomo**: IA responde automaticamente dentro do horário configurado; fora do horário → agente humano

### lib/whatsapp.ts — interface principal
```typescript
interface WhatsAppClient {
  enviarTexto(numero: string, mensagem: string): Promise<void>
  enviarArquivo(numero: string, url: string, nome: string): Promise<void>
  obterQRCode(): Promise<string>
  verificarConexao(): Promise<'conectado' | 'desconectado'>
}
// Implementar para Evolution API e Z-API com factory pattern
// const wa = createWhatsAppClient(process.env.WHATSAPP_PROVIDER)
```

---

## Módulo de IA (Claude API)

### Funcionalidades

#### 1. Sugestão de resposta (dentro do ticket)
- Agente clica em "✨ Sugerir resposta" no detalhe do ticket
- IA lê: título, categoria, histórico de mensagens, artigos da KB relacionados
- Retorna rascunho que o agente pode editar e enviar
- Salva uso em `ia_logs`

#### 2. Classificação automática ao abrir ticket
- Ao criar ticket, IA sugere categoria e prioridade com base no título + descrição
- Agente pode aceitar ou alterar
- Prompt base: categorias disponíveis + regras de negócio do cliente

#### 3. Resumo do ticket
- Botão "📋 Resumir conversa" no detalhe do ticket
- Útil para agentes que pegam ticket no meio; IA gera briefing em 3-5 linhas

#### 4. Base de conhecimento — sugestão automática
- Ao abrir ticket pelo portal do cliente, busca artigos relacionados ao título
- Combinação: busca vetorial (pg_trgm) + chamada IA para rankeamento

#### 5. Bot WhatsApp (quando modo autônomo ativo)
- Contexto: histórico das últimas 10 mensagens + dados do cliente + artigos KB
- Pode criar ticket, consultar status, responder dúvidas simples
- Escala para humano quando confiança < threshold configurável

### lib/ia.ts — funções principais
```typescript
// Sugestão de resposta para o agente
export async function sugerirResposta(ticketId: string): Promise<string>

// Classificar ticket recém-aberto
export async function classificarTicket(titulo: string, descricao: string, categorias: Categoria[]): Promise<{
  categoria_id: string
  prioridade: 'baixa' | 'normal' | 'alta' | 'urgente'
  confianca: number
}>

// Resumo do histórico do ticket
export async function resumirTicket(ticketId: string): Promise<string>

// Bot WhatsApp — gerar resposta para mensagem recebida
export async function responderWhatsApp(params: {
  numero: string
  mensagem: string
  historico: WaMensagem[]
  cliente?: Cliente
  ticketAtual?: Ticket
}): Promise<{
  resposta: string
  acao?: 'criar_ticket' | 'consultar_status' | 'escalar_humano'
  confianca: number
}>
```

### Prompt base (sistema) para sugestão de resposta
```
Você é um assistente de suporte da empresa {{empresa_nome}}.
Seu papel é ajudar o agente {{agente_nome}} a redigir respostas profissionais, claras e empáticas para tickets de suporte.

Contexto do ticket:
- Número: {{numero_ticket}}
- Título: {{titulo}}
- Categoria: {{categoria}}
- Prioridade: {{prioridade}}
- Cliente: {{cliente_nome}}

Histórico de mensagens:
{{historico}}

Artigos da base de conhecimento relacionados:
{{artigos_kb}}

Escreva uma resposta em português brasileiro, tom profissional mas acolhedor.
Máximo 3 parágrafos. Não invente informações técnicas que não estejam no contexto.
Retorne apenas o texto da resposta, sem saudações como "Prezado(a)" — o sistema adiciona automaticamente.
```

### Prompt base para bot WhatsApp
```
Você é o assistente virtual de suporte da {{empresa_nome}} no WhatsApp.
Seja direto, simpático e útil. Responda em português.

Dados do cliente: {{dados_cliente}}
Histórico recente: {{historico_whatsapp}}
Ticket atual (se houver): {{ticket_atual}}
Categorias de suporte disponíveis: {{categorias}}
Artigos úteis: {{artigos_kb}}

Regras:
1. Se conseguir resolver com informação da KB → responda diretamente
2. Se precisar criar ticket → responda que vai abrir chamado e use acao: "criar_ticket"
3. Se for urgente ou complexo → use acao: "escalar_humano"
4. Nunca prometa prazos específicos que não estejam no SLA

Retorne JSON: { "resposta": "...", "acao": "criar_ticket|escalar_humano|null", "confianca": 0-1 }
```

---

## Regras de negócio críticas

### Tickets
- `numero` gerado pela função `fn_gerar_numero_ticket(empresa_id)` → TK-00001
- SLA inicia automaticamente ao criar ticket (com base em categoria + prioridade)
- SLA pausa quando status = `aguardando_cliente`
- SLA retoma quando cliente responde (nova mensagem do cliente)
- Notas internas (`mensagens.interna = true`) nunca visíveis ao cliente
- Reabrir ticket fechado: permitido ao cliente em até 7 dias
- Ticket via WhatsApp: cria automaticamente com `canal = 'whatsapp'` na tabela

### Segurança
- Todo query filtra por `empresa_id` (isolamento multi-tenant)
- Nunca retornar `password_hash` nas APIs
- Webhook do WhatsApp validar assinatura/token antes de processar
- Logs de IA nunca armazenar dados sensíveis (CNPJ, senhas, cartões)

### Padrões de código
- Queries SQL raw com `pg` pool (sem ORM) — padrão do ERP
- Validação com `zod` em todas as rotas de API
- Erros retornam `{ error: string, code?: string }`
- Datas: UTC no banco, `date-fns-tz` para exibição em America/Sao_Paulo
- `cn()` do shadcn para classes condicionais

---

## Sprints planejados

| Sprint | Entregável |
|---|---|
| 1 | Auth, perfis, sidebar two-panel, CRUD usuários e clientes |
| 2 | Categorias, campos extras, abertura de ticket (portal + painel) |
| 3 | Respostas, notas internas, ciclo de vida do ticket |
| 4 | SLA automático: cálculo, alertas, painel violações |
| 5 | **WhatsApp**: webhook, criação automática de ticket, chat no painel |
| 6 | **IA**: sugestão de resposta, classificação automática, resumo |
| 7 | **Bot WhatsApp IA**: modo sugestão e modo autônomo |
| 8 | Notificações e-mail (Resend + templates) |
| 9 | Relatórios, CSAT, exportação PDF/Excel |
| 10 | Solicitações internas + base de conhecimento |
| 11 | Refinamentos, testes, deploy Railway produção |

---

## Sprint atual: 1

**Objetivo**: Estrutura base + autenticação + sidebar + CRUD usuários e clientes

**Tarefas**:
- [ ] `npx create-next-app@latest digitalrf-help --typescript --tailwind --app`
- [ ] Instalar deps: `shadcn/ui pg jose zod date-fns date-fns-tz lucide-react @anthropic-ai/sdk`
- [ ] `lib/db.ts` — pool PostgreSQL
- [ ] Middleware auth (proteger rotas por perfil)
- [ ] Telas de login (operador + cliente)
- [ ] Layout com sidebar two-panel retrátil
- [ ] API + telas: CRUD usuários
- [ ] API + telas: CRUD clientes (lista + ficha)

---

## Dependências NPM

```json
{
  "dependencies": {
    "next": "14",
    "react": "^18",
    "typescript": "^5",
    "tailwindcss": "^3",
    "pg": "^8",
    "jose": "^5",
    "zod": "^3",
    "date-fns": "^3",
    "date-fns-tz": "^3",
    "lucide-react": "latest",
    "@anthropic-ai/sdk": "^0.39",
    "resend": "^3",
    "axios": "^1"
  }
}
```

shadcn/ui components necessários:
`button input label select textarea badge card table dialog sheet toast avatar dropdown-menu separator`

---

## Notas de sessão
<!-- Claude Code: adicione aqui decisões tomadas durante o desenvolvimento -->
- Schema SQL executado em: [data]
- Empresa ID padrão: 00000000-0000-0000-0000-000000000001
- Admin padrão: admin@digitalrf.com.br
