# PROMPT — Acesso Remoto via RustDesk no Ticket
# Cole este prompt no Claude Code dentro do projeto digitalrf-help

---

Preciso implementar a funcionalidade de **acesso remoto** dentro da página de ticket, usando **RustDesk self-hosted** como solução de controle remoto.

## Contexto do projeto

- Stack: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui
- Banco: PostgreSQL com `pg` raw queries (sem ORM)
- Auth: JWT em httpOnly cookie, helper `getUsuarioFromRequest(req)` em `lib/auth.ts`
- Pool de conexão: `query()` em `lib/db.ts`
- Padrão de API: retorna `{ error: string }` em erros, JSON direto em sucesso
- Datas em UTC no banco, exibir em America/Sao_Paulo
- Variável de ambiente disponível: `NEXT_PUBLIC_RUSTDESK_SERVER`

## O que implementar

### 1. Migration SQL

Crie o arquivo `sql/migrations/007_remote_sessions.sql` com:

```sql
-- Tabela de sessões de acesso remoto
CREATE TABLE remote_sessions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id          UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  usuario_id         UUID NOT NULL REFERENCES usuarios(id),
  rustdesk_peer_id   VARCHAR(20),
  session_type       VARCHAR(20) NOT NULL CHECK (session_type IN ('agent', 'portable')),
  status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'active', 'closed', 'failed')),
  criado_em          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  iniciado_em        TIMESTAMPTZ,
  encerrado_em       TIMESTAMPTZ,
  duracao_segundos   INTEGER
);

CREATE INDEX idx_remote_sessions_ticket ON remote_sessions(ticket_id);
CREATE INDEX idx_remote_sessions_status ON remote_sessions(status);

-- Campo no cadastro do cliente para salvar ID fixo do agente
ALTER TABLE clientes
  ADD COLUMN IF NOT EXISTS rustdesk_peer_id  VARCHAR(20),
  ADD COLUMN IF NOT EXISTS rustdesk_instalado BOOLEAN DEFAULT FALSE;
```

### 2. API Route

Crie `app/api/tickets/[id]/remote-session/route.ts` com 3 métodos:

**POST** — cria nova sessão
- Body: `{ session_type: 'agent' | 'portable', peer_id?: string }`
- Fecha sessão anterior ativa/pendente do mesmo ticket antes de criar
- Valida que o ticket existe
- Retorna a sessão criada

**PATCH** — atualiza status da sessão
- Body: `{ session_id: string, status: 'active' | 'closed', peer_id?: string }`
- Ao fechar: calcula `duracao_segundos = EXTRACT(EPOCH FROM (NOW() - iniciado_em))`

**GET** — histórico de sessões do ticket
- Retorna as últimas 10 sessões com nome do atendente (JOIN em usuarios)
- Ordenado por `criado_em DESC`

### 3. Componente React

Crie `components/ticket/RemoteAccessPanel.tsx`.

**Props:**
```ts
interface RemoteAccessPanelProps {
  ticketId: string
  clienteNome: string
  clienteWhatsapp: string        // formato: "5534999999999"
  clienteRustdeskId?: string     // preenchido se tiver agente fixo
}
```

**Estados da UI (máquina de estados simples):**
- `idle` — botão "Iniciar sessão remota"
- `choosing` — modal/dropdown com duas opções:
  - Se `clienteRustdeskId` existir: "Conectar (agente fixo)" com badge "Recomendado"
  - Sempre disponível: "Enviar link pelo WhatsApp"
- `awaiting_code` — input para digitar o código de 9 dígitos que o cliente informa
- `connecting` — feedback visual de 2s
- `connected` — banner verde com timer ao vivo (contador de segundos) + botão "Encerrar"
- `closed` — confirmação + botão "Nova sessão"

**Comportamentos:**
- Ao escolher "WhatsApp": chama `POST /api/tickets/:id/remote-session` com `session_type: 'portable'`, depois abre `https://wa.me/${clienteWhatsapp}?text=...` com mensagem formatada incluindo o link do `.exe` portátil (`${process.env.NEXT_PUBLIC_RUSTDESK_SERVER}/rustdesk-portable.exe`)
- Ao conectar: chama `PATCH` para status `active`, abre `rustdesk://connect/${peerId}` no navegador
- Ao encerrar: chama `PATCH` para status `closed`, exibe duração
- Mostrar histórico das últimas sessões abaixo do painel (busca no GET)
- Timer: `useEffect` com `setInterval` de 1s quando `step === 'connected'`

**Visual:**
- Use componentes shadcn/ui: `Button`, `Badge`, `Input`, `Card`, `Separator`
- Ícones lucide-react: `Monitor`, `Wifi`, `WifiOff`, `Clock`, `Phone`
- Badge de status: verde para `active`, cinza para `closed`, amarelo para `pending`
- Mensagem WhatsApp formatada:
```
Olá [nome]! Para acessarmos seu computador e resolver o chamado:

1️⃣ Clique neste link e execute o arquivo (não precisa instalar):
https://[RUSTDESK_SERVER]/rustdesk-portable.exe

2️⃣ Me informe o código de 9 dígitos que aparecer na tela.

A conexão é segura e será encerrada assim que resolvermos. ✅
```

### 4. Integração na página do ticket

No arquivo `app/(painel)/tickets/[id]/page.tsx` (ou onde está o detalhe do ticket):
- Importe e renderize `<RemoteAccessPanel />` dentro do layout do ticket
- Posicione após a seção de respostas ou em uma aba/sidebar lateral
- Passe as props buscando os dados do cliente junto com o ticket na query SQL existente
- Adicione o campo `rustdesk_peer_id` do cliente na query se ainda não estiver presente

### 5. Variável de ambiente

Adicione em `.env.local` (se não existir):
```env
NEXT_PUBLIC_RUSTDESK_SERVER=rustdesk.seudominio.com
```

---

## Regras importantes

- Não usar ORM — apenas `query()` de `lib/db.ts`
- Sempre validar `usuario` com `getUsuarioFromRequest(req)` nas rotas
- Não expor dados de outros tickets (filtrar sempre por `ticket_id`)
- O componente deve funcionar mesmo se a API do histórico falhar (try/catch silencioso)
- Usar `cn()` do shadcn para classes condicionais

## Ordem de execução

1. Criar e rodar a migration SQL
2. Criar a API route
3. Criar o componente `RemoteAccessPanel`
4. Integrar na página do ticket

Pode começar.
