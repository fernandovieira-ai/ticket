# Teste WhatsApp

Skill para testar rapidamente se o WhatsApp (WPPConnect) está funcionando.

## O que fazer

Execute o script de diagnóstico com:

```
node scripts/diagnostico-whatsapp.js
```

O script:
1. Conecta no banco e lê a `whatsapp_config`
2. Verifica instâncias em `whatsapp_instancias`
3. Gera token WPPConnect
4. Envia mensagem de teste para **5534991931617** (Fernando)

## Interpretação do resultado

- `HTTP 201` + `status: "success"` → tudo ok
- `FALHA na geração do token` → WPPConnect server fora do ar ou key errada
- `FALHA no envio` → instância desconectada (precisa reconectar no painel WPPConnect)
- `whatsapp_config VAZIA` → salvar config em Configurações > WhatsApp > API no painel

## Enviar para outro número

Para testar com um número diferente, edite temporariamente a linha no script:

```js
phone: '55XXXXXXXXXXX',  // 55 + DDD + número (13 dígitos)
```

## Configuração atual (banco)

| Campo    | Onde configurar                          |
|----------|------------------------------------------|
| URL      | Configurações > WhatsApp > API no painel |
| Key      | SECRET_KEY do servidor WPPConnect        |
| Instance | Nome da sessão no WPPConnect             |

## Reconectar instância desconectada

Se a instância aparecer como `status=desconectado`, acesse o painel do WPPConnect Server em Railway e escaneie o QR Code novamente.
