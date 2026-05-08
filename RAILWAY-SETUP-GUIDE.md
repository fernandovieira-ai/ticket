# 🚀 Guia Completo: Railway Volumes (Configuração Otimizada)

## 📋 Passo a Passo Detalhado

### 1. Acessar Railway Dashboard
```
1. Acesse: https://railway.app/dashboard
2. Selecione o projeto: digitalrf-help
3. Clique na aba "Settings" (⚙️)
```

### 2. Configurar Volume (EXATO)
```
Na seção "Volumes":
┌─────────────────────────────────────────┐
│ ➕ Add Volume                           │
│                                         │
│ Mount Path: /app/storage                │
│ Size: 10 GB                             │
│ Name: digitalrf-attachments             │
│                                         │
│ [ Create Volume ]                       │
└─────────────────────────────────────────┘
```

### 3. Variáveis de Ambiente (ADICIONAR)
```
Na seção "Variables":
┌─────────────────────────────────────────┐
│ RAILWAY_VOLUME_MOUNT_PATH=/app/storage  │
│ STORAGE_TYPE=volume                     │
│ MAX_FILE_SIZE=25000000                  │
│ BACKUP_ENABLED=true                     │
└─────────────────────────────────────────┘
```

### 4. Configurações Avançadas
```
Na seção "Deploy":
┌─────────────────────────────────────────┐
│ ✅ Auto Deploy: ON                      │
│ ✅ Build Cache: ON                      │
│ ⚠️  Deploy Logs: Monitor após config    │
└─────────────────────────────────────────┘
```

## ⚡ Otimizações Extras

### Performance
- Volume SSD automático (Railway padrão)
- Cache de 1 hora para anexos
- Compressão gzip habilitada

### Segurança  
- Autenticação obrigatória
- Validação de MIME types
- Path traversal protection

### Monitoramento
- Logs detalhados de acesso
- Alertas de espaço em disco
- Backup automático (futuro)

## 🧪 Teste da Configuração

Após configurar, teste:
```
1. Upload novo anexo
2. Verificar: /api/debug/files?ticketId=NOVO_ID
3. Acessar anexo pelo link
4. Fazer novo deploy (teste persistência)
```

## 🎯 Configuração Ideal Resumida

| Item | Valor | Motivo |
|------|-------|--------|
| Volume Size | 10 GB | Espaço suficiente por ~2 anos |
| Mount Path | /app/storage | Padrão recomendado |
| Auto Deploy | ON | Atualizações automáticas |
| Cache | 1h | Balance performance/atualização |

## ⚠️ IMPORTANTE

Após configurar o volume:
1. **Primeiro deploy** pode demorar mais (criando estrutura)
2. **URLs antigas** continuarão 404 até reupload
3. **Novos uploads** funcionarão normalmente
4. **Backup manual** recomendado antes de mudanças grandes