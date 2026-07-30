# Migração Evolution API → WPPConnect Server

**Data:** 2026-07-30  
**Motivo:** Evolution API v2.4.0+ apresentava bug crítico removendo 9º dígito de números brasileiros e erro 463 (Signal/LID session)

---

## 🎯 RESUMO DAS MUDANÇAS

### 1. **Integração WPPConnect Server v2.10.1**

#### **lib/whatsapp.ts**
- ✅ Adicionada função `generateWPPToken()` para gerar token de autenticação dinâmico
  - Token gerado a cada requisição usando SECRET_KEY
  - Endpoint: `POST /api/{session}/{secretkey}/generate-token`
  - Retorna token temporário usado nas chamadas subsequentes
  
- ✅ Atualizada função `enviarMensagem()`:
  - **ANTES:** `Authorization: Bearer {token_fixo}` (Evolution API)
  - **AGORA:** Gera token dinamicamente antes de cada envio
  - URL: `/api/{session}/send-message`
  - Body: `{ phone: "5534991234567", message: "texto", isGroup: false }`
  - Validação: número deve ter 12-13 dígitos (DDI 55 + DDD + número)

- ✅ Atualizada função `normalizarTelefone()`:
  - **REMOVIDO:** Sufixo `@lid` (causava erro 463 na Evolution API)
  - Retorna apenas 13 dígitos: `5534991234567`

#### **app/api/whatsapp/instancias/route.ts** (Criar Instância)
- ✅ **SIMPLIFICADO:** Criação agora apenas registra no banco
  - Sessão WPPConnect é criada ao clicar em "Conectar", não ao criar
  - Evita travamento quando sessão não existe ainda no WPPConnect

#### **app/api/whatsapp/instancias/[id]/connect/route.ts** (Conectar/QR Code)
- ✅ Fluxo completo implementado:
  1. Gera token usando SECRET_KEY
  2. Verifica status atual da sessão (`GET /api/{session}/status-session`)
  3. Se CLOSED ou sem QR code → chama `POST /api/{session}/start-session`
  4. Aguarda 2s para inicialização
  5. Busca QR Code atualizado
  6. Salva QR Code no banco e retorna para UI

#### **app/api/whatsapp/instancias/[id]/status/route.ts** (Verificar Status)
- ✅ Polling para detectar conexão:
  1. Gera token dinâmico
  2. Chama `GET /api/{session}/status-session`
  3. Mapeia status WPPConnect → status interno:
     - `CONNECTED` → `"conectado"`
     - `QRCODE` → `"aguardando_qr"`
     - `CLOSED` → `"desconectado"`
     - `INITIALIZING` → `"conectando"`
  4. Atualiza banco se status mudou

---

### 2. **Correção Tailwind CSS v4 → v3**

**Problema:** Tailwind CSS v4.2.1 apresentava erro `CssSyntaxError: Invalid code point 10567749`

#### **package.json**
```diff
- "@tailwindcss/postcss": "^4"
- "tailwindcss": "^4"
+ "autoprefixer": "^10.5.4"
+ "postcss": "^8.5.25"
+ "tailwindcss": "3.4.1"
+ "@tailwindcss/typography": "0.5.10"
```

#### **tailwind.config.js** (NOVO)
- Criado arquivo de configuração (obrigatório no v3)
- Content paths: `pages/`, `components/`, `app/`, `src/`
- Plugin: `@tailwindcss/typography`

#### **postcss.config.mjs**
```diff
- plugins: { "@tailwindcss/postcss": {} }
+ plugins: { tailwindcss: {}, autoprefixer: {} }
```

#### **app/globals.css**
- Convertido de sintaxe v4 para v3:
  - `@import "tailwindcss"` → `@tailwind base; @tailwind components; @tailwind utilities;`
  - Removido `@theme inline` e `@custom-variant`
  - Mantidas todas as variáveis CSS customizadas

---

### 3. **Correções de UI**

#### **app/painel/configuracoes/whatsapp/page.tsx**
- ✅ **Fix React Hydration Error:**
  ```tsx
  // ANTES: typeof window !== 'undefined' ? window.location.origin : ""
  // AGORA: useState + useEffect para evitar mismatch SSR/CSR
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  ```

- ✅ **Textos atualizados:**
  - "Evolution API" → "WPPConnect API"
  - Placeholder: `https://wppconnect.seudominio.com.br`
  - Help text: "WPPConnect Server" em vez de "Evolution API"

#### **components/layout/sidebar.tsx**
- ✅ Removidas bordas brancas:
  - Header: removido `border-b` e `borderColor`
  - Rodapé: removido `borderTop` antes do botão "Sair"

#### **app/globals.css**
- ✅ Variável `--sidebar-border` alterada para `transparent` (dark mode)

---

## 🔐 CONFIGURAÇÃO WPPConnect

### **Variáveis de Ambiente (Railway)**
```env
SECRET_KEY=THISISMYSECURETOKEN
```

### **Configuração no Sistema (UI)**
1. Acesse: **Configurações → WhatsApp → API**
2. Preencha:
   - **URL:** `https://wppconnect-server-production-d6f6.up.railway.app`
   - **Token (SECRET_KEY):** `THISISMYSECURETOKEN`
   - **Instância:** `DRF`
3. Clique em **Salvar**

### **Fluxo de Autenticação**
```
1. Sistema armazena SECRET_KEY no banco (evolution_api_key)
2. Ao fazer qualquer operação:
   a) Chama POST /api/{session}/{SECRET_KEY}/generate-token
   b) Recebe token temporário (ex: $2b$10$s4PLv...)
   c) Usa token nas requisições subsequentes (Authorization: Bearer {token})
3. Token é gerado novamente a cada operação (não é reutilizado)
```

---

## ✅ TESTES REALIZADOS

### **1. Geração de Token**
```bash
POST /api/DRF/THISISMYSECURETOKEN/generate-token
→ 201 Created
→ { "token": "$2b$10$s4PLvRjXzPY0QMIrA8NiXe..." }
```

### **2. Verificação de Status**
```bash
GET /api/DRF/status-session
Authorization: Bearer $2b$10$s4PLv...
→ 200 OK
→ { "status": "CONNECTED" }
```

### **3. Envio de Mensagem Manual**
```bash
POST /api/DRF/send-message
Authorization: Bearer $2b$10$s4PLv...
Body: { "phone": "5534991931617", "message": "teste", "isGroup": false }
→ 200 OK
→ Mensagem recebida no WhatsApp ✅
```

### **4. Criação de Ticket pelo Portal**
- Cliente abre ticket → notificarWhatsappNovoTicket() chamada
- Sistema gera token → envia mensagem via WPPConnect
- Mensagem chega no WhatsApp dos contatos do departamento ✅

---

## 📊 DIFERENÇAS Evolution API vs WPPConnect

| Aspecto | Evolution API | WPPConnect |
|---------|---------------|------------|
| **Autenticação** | `apikey` header estático | `Authorization: Bearer {token}` dinâmico |
| **Gerar Token** | Não necessário | `POST /api/{session}/{secretkey}/generate-token` |
| **Criar Sessão** | `POST /instance/create` | `POST /api/{session}/start-session` |
| **Status** | `GET /instance/connectionState/{name}` | `GET /api/{session}/status-session` |
| **Enviar Msg** | `POST /message/sendText/{instance}` | `POST /api/{session}/send-message` |
| **Formato Número** | Aceita `@s.whatsapp.net` | Apenas dígitos (13) |
| **Bug 9º Dígito** | ❌ Remove 9º dígito (v2.4.0+) | ✅ Mantém número correto |
| **Erro 463** | ❌ Signal/LID session error | ✅ Não apresenta |

---

## 🚨 BREAKING CHANGES

### **1. Configuração Obrigatória**
- Sistema agora **requer SECRET_KEY** do WPPConnect configurada
- Campo "Token" na UI armazena a SECRET_KEY, não um token gerado

### **2. Sessões Antigas (Evolution API)**
- Sessões criadas com Evolution API **não funcionarão** automaticamente
- Solução: Recriar sessões no WPPConnect ou manter Evolution API rodando em paralelo

### **3. Formato de Número**
- Sistema sempre envia 13 dígitos sem sufixo
- Números com 9º dígito faltando são corrigidos automaticamente

---

## 📝 ARQUIVOS MODIFICADOS

### **Código Principal**
- ✅ `lib/whatsapp.ts` (+25 linhas, função generateWPPToken)
- ✅ `app/api/whatsapp/instancias/route.ts` (-15 linhas, simplificado)
- ✅ `app/api/whatsapp/instancias/[id]/connect/route.ts` (+30 linhas, fluxo completo)
- ✅ `app/api/whatsapp/instancias/[id]/status/route.ts` (+10 linhas, token dinâmico)

### **Configuração & Build**
- ✅ `package.json` (downgrade Tailwind v4 → v3)
- ✅ `tailwind.config.js` (NOVO)
- ✅ `postcss.config.mjs` (atualizado para v3)
- ✅ `app/globals.css` (sintaxe v3)

### **UI/UX**
- ✅ `app/painel/configuracoes/whatsapp/page.tsx` (hydration fix + textos)
- ✅ `components/layout/sidebar.tsx` (bordas removidas)

### **Infraestrutura**
- ✅ `.gitignore` (ignora arquivos temporários de teste)

---

## 🔄 PRÓXIMOS PASSOS (Produção)

1. **Deploy WPPConnect Server** (já feito: Railway)
2. **Atualizar Configuração:**
   - Acesse produção: https://digitalrf-help.com.br/painel/configuracoes/whatsapp
   - Cole SECRET_KEY: `THISISMYSECURETOKEN`
   - Teste conexão
3. **Recriar Instâncias WhatsApp:**
   - Deletar instâncias antigas (Evolution API)
   - Criar novas via interface
   - Conectar via QR Code
4. **Monitorar Logs:**
   - Railway: WPPConnect Server logs
   - Sistema: verificar envios de mensagem
5. **Testar Fluxo Completo:**
   - Criar ticket pelo portal
   - Verificar recebimento no WhatsApp

---

## 📚 REFERÊNCIAS

- **WPPConnect Docs:** https://wppconnect.io/
- **Evolution API Issues:** 
  - #2653 (Signal/LID session error)
  - #2650 (9th digit removal)
  - #2588 (Phone number normalization)
- **Tailwind CSS v3 Docs:** https://v3.tailwindcss.com/

---

## ✅ VALIDAÇÃO FINAL

### **Testes Locais**
- [x] Token gerado corretamente
- [x] QR Code exibido na interface
- [x] Conexão detectada automaticamente (polling)
- [x] Mensagem enviada via lib/whatsapp.ts
- [x] Ticket criado dispara notificação WhatsApp
- [x] CSS compilando sem erros
- [x] UI sem linhas brancas no sidebar
- [x] Hydration error resolvido

### **Prontos para Deploy**
- [x] Código commitado e testado
- [x] Dependencies atualizadas (pnpm-lock.yaml)
- [x] Arquivos temporários ignorados (.gitignore)
- [x] README/CHANGELOG documentado

---

**Desenvolvido por:** Claude Code  
**Aprovado por:** Fernando Vieira (fernando.vieira@digitalrf.com.br)  
**Status:** ✅ Pronto para produção
