# 📁 Configuração de Storage Persistente

## Problema Original
- Railway substitui filesystem a cada deploy
- Arquivos em `public/uploads` são perdidos
- Links de anexos ficam quebrados (404)

## ✅ Solução 1: Railway Volumes (Recomendado)

### Passo 1: Configurar Volume no Railway
1. Acesse Railway Dashboard
2. Vá em seu projeto → Settings → Volumes
3. Clique "Add Volume"
4. Configure:
   ```
   Mount Path: /app/storage
   Size: 5GB (ou conforme necessidade)
   ```

### Passo 2: Variável de Ambiente
No Railway Dashboard → Variables:
```
RAILWAY_VOLUME_MOUNT_PATH=/app/storage
```

### Passo 3: Deploy
- Faça push das alterações
- O sistema detectará automaticamente o volume

## ✅ Solução 2: Storage Externo

### Opção A: AWS S3
```env
AWS_S3_BUCKET=seu-bucket
AWS_ACCESS_KEY_ID=sua-key
AWS_SECRET_ACCESS_KEY=sua-secret
AWS_REGION=us-east-1
```

### Opção B: Cloudinary
```env
CLOUDINARY_CLOUD_NAME=seu-cloud
CLOUDINARY_API_KEY=sua-key
CLOUDINARY_API_SECRET=seu-secret
```

### Opção C: Vercel Blob
```env
BLOB_READ_WRITE_TOKEN=seu-token
```

## 🔄 Migração de Arquivos Existentes

Para recuperar arquivos perdidos:
1. Restaurar de backup se disponível
2. Ou pedir para usuários reenviarem anexos importantes
3. Implementar backup automático

## 🛡️ Prevenção Futura

1. **Backup Regular**: Script automático para backup de arquivos
2. **Monitoring**: Alertas quando arquivos não são encontrados
3. **Fallback**: Storage redundante para arquivos críticos

## 📊 Comparação de Soluções

| Solução | Prós | Contras | Custo |
|---------|------|---------|--------|
| Railway Volumes | Simples, rápido | Limitado ao Railway | ~$5/mês |
| AWS S3 | Robusto, CDN | Mais complexo | ~$1/mês |
| Cloudinary | Otimização imagem | API limits | Grátis até 25GB |
| Database Blob | Sem config externa | Pode lentificar DB | Incluído |

## 🚀 Status Atual
- [x] Código atualizado para suportar volumes
- [x] Fallback para desenvolvimento local  
- [ ] Volume configurado no Railway
- [ ] Migração de arquivos existentes