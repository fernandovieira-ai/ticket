# 🚂 Guia de Deploy Railway - DigitalRF Help

## 🔧 Correções Aplicadas

### 1. **Retry Automático de Conexões** ✅
- Sistema de retry em `lib/db-unified.ts` e `lib/db.ts`
- Até 3 tentativas com backoff exponencial
- Protege contra timeouts e conexões perdidas

### 2. **Build ID Consistente** ✅
- Usa `RAILWAY_GIT_COMMIT_SHA` para gerar Build ID único
- Evita que Server Actions sejam invalidadas entre deploys
- Reduz erros "Failed to find Server Action"

### 3. **Error Boundary Global** ✅
- Detecta automaticamente erros de deploy
- Recarrega página quando necessário
- UX amigável para usuários

### 4. **Health Check Melhorado** ✅
- Endpoint `/api/health` com informações de build
- Railway usa para validar deployments
- Timeout de 30 segundos

### 5. **Middleware de Versão** ✅
- Headers `X-Build-Version` para debugging
- Cache apropriado para Server Actions

## 📋 Variáveis de Ambiente no Railway

Adicione estas variáveis no Railway Dashboard → Variables:

```bash
# === Build & Deploy ===
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1

# === PostgreSQL Optimizations ===
PGCONNECT_TIMEOUT=8
PGSTATEMENT_TIMEOUT=10000
PGIDLE_IN_TRANSACTION_SESSION_TIMEOUT=10000
PGTCP_USER_TIMEOUT=30000

# === NextAuth (já configuradas) ===
# NEXTAUTH_URL=https://seu-dominio.railway.app
# NEXTAUTH_SECRET=...
# DATABASE_URL=...

# === SMTP (já configuradas) ===
# SMTP_HOST=...
# SMTP_PORT=...
# etc...
```

## 🚀 Processo de Deploy

### 1. **Antes de Fazer Deploy**

```bash
# Certifique-se que o build local funciona
pnpm build

# Teste o servidor standalone
pnpm start
```

### 2. **Deploy no Railway**

```bash
# Commit e push para o repositório
git add .
git commit -m "fix: resolver timeouts de conexão e erros de Server Actions"
git push
```

O Railway vai:
1. ✅ Fazer build automaticamente
2. ✅ Usar o commit SHA como Build ID
3. ✅ Executar health check em `/api/health`
4. ✅ Fazer rollout gradual (se configurado)

### 3. **Após o Deploy**

1. **Verificar Health Check:**
   ```bash
   curl https://seu-app.railway.app/api/health
   ```
   
   Resposta esperada:
   ```json
   {
     "status": "ok",
     "buildId": "abc1234",
     "env": "production",
     "uptime": 123.45
   }
   ```

2. **Monitorar Logs:**
   - Railway Dashboard → Deployments → View Logs
   - Procure por:
     - ✅ `[db-unified] Pool error:` (não deve aparecer)
     - ✅ `Failed to find Server Action` (não deve aparecer)
     - ✅ `ECONNRESET` relacionado a banco (retry deve resolver)

3. **Testar no Browser:**
   - Limpe o cache do navegador (Ctrl + Shift + R)
   - Teste funcionalidades críticas
   - Verifique headers de versão:
     ```javascript
     // No console do browser
     fetch('/api/health').then(r => r.json()).then(console.log)
     ```

## 🐛 Troubleshooting

### Erro: "Failed to find Server Action"

**Causa:** Cliente com versão antiga do código tentando chamar Server Action nova

**Solução Automática:**
- O error boundary detecta e recarrega a página
- Aguarda 2 segundos antes de recarregar

**Solução Manual:**
- Limpe cache do navegador
- Faça hard refresh (Ctrl + Shift + R)

### Erro: "ECONNRESET" persistente

**Causa:** Timeout de conexão com banco de dados

**Verificações:**
1. ✅ Confirme que as variáveis `PGCONNECT_TIMEOUT` estão configuradas
2. ✅ Verifique se o banco está rodando: Railway → Database → Metrics
3. ✅ Confira os logs do pool: `[db-unified] Pool error:`

**Se persistir:**
- Aumente o `connectionTimeoutMillis` em `lib/db-unified.ts`
- Reduza o `max` pool size de 10 para 5

### Erro: "Connection terminated unexpectedly"

**Causa:** Conexão com banco foi perdida

**Solução:**
- O sistema de retry já lida com isso
- Se persistir, verifique se o Railway está com instabilidade
- Considere adicionar PgBouncer (Railway Add-On)

## 📊 Monitoramento

### Métricas Importantes

1. **Response Time:** < 2s para a maioria das requisições
2. **Error Rate:** < 1% de erros de Server Actions
3. **Database Connections:** < 8 conexões ativas (max 10)
4. **CPU Usage:** < 70% em média
5. **Memory Usage:** < 400MB

### Logs a Monitorar

```bash
# Sucesso de retry
"[db-unified] Query retry successful after X attempts"

# Erro de pool (NÃO deve aparecer frequentemente)
"[db-unified] Pool error:"

# Build version nos headers
"X-Build-Version: abc1234"
```

## 🎯 Checklist Pós-Deploy

- [ ] Health check retorna 200 OK
- [ ] Build ID está correto nos headers
- [ ] Sem erros de Server Action nos logs
- [ ] Conexões de banco estáveis
- [ ] UI carrega sem erros no console
- [ ] Testar login/logout
- [ ] Testar operações de CRUD
- [ ] Verificar imagens carregam corretamente

## 🔄 Rollback

Se algo der errado:

1. **Via Railway Dashboard:**
   - Deployments → Encontre deploy anterior estável
   - Clique nos 3 pontinhos → "Redeploy"

2. **Via Git:**
   ```bash
   git revert HEAD
   git push
   ```

## 📚 Referências

- [Next.js Caching](https://nextjs.org/docs/app/building-your-application/caching)
- [Server Actions](https://nextjs.org/docs/app/building-your-application/data-fetching/server-actions-and-mutations)
- [Railway Deployments](https://docs.railway.app/deploy/deployments)
- [PostgreSQL Connection Pool](https://node-postgres.com/apis/pool)

---

**Última atualização:** 2026-06-02  
**Versão do guia:** 1.0
