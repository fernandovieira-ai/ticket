# EMSys3 — Engenharia Reversa (REA + Ghidra)

Skill de referência para investigar o binário `EMSys3.exe` (Delphi/Borland, 32-bit) usando o REA (`rea-agents`) com Ghidra, para fins de suporte/manutenção autorizada (diagnóstico de bugs, formato de dados, integração). **Não usar para burlar/gerar licenças** — isso é pirataria e está fora do escopo.

## Toolchain instalada (portátil, não mexe no sistema)

Tudo em `C:\tools`, sem alterar Node/Java do sistema:

| Ferramenta | Caminho |
|---|---|
| Node.js 24.18.0 | `C:\tools\node24\node.exe` |
| JDK 21 (Temurin) | `C:\tools\jdk-21.0.12.1+1` |
| Ghidra 12.1.4 | `C:\tools\ghidra_12.1.4_PUBLIC` |
| rea-agents CLI | `C:\tools\rea-global\node_modules\rea-agents\scripts\rea.mjs` |
| UPX 5.2.1 | `C:\tools\upx-5.2.1-win64\upx.exe` |

### Variáveis de ambiente necessárias (toda sessão PowerShell)

```powershell
$env:GHIDRA_INSTALL_DIR = "C:\tools\ghidra_12.1.4_PUBLIC"
$env:JAVA_HOME = "C:\tools\jdk-21.0.12.1+1"
$env:REA_ANALYSIS_PROVIDER = "ghidra"
$env:REA_GHIDRA_STARTUP_TIMEOUT_MS = "14400000"  # 4h — OBRIGATORIO, binario e gigante
```

Comando base:
```powershell
& "C:\tools\node24\node.exe" "C:\tools\rea-global\node_modules\rea-agents\scripts\rea.mjs" <comando> ...
```

## Armadilhas conhecidas

1. **UPX**: o `EMSys3.exe` distribuído é compactado com UPX (seções `UPX0`/`UPX1`). Ghidra só vê o stub, não o código real. Sempre descompactar antes:
   ```powershell
   Copy-Item "C:\Linx\EMSYS3\EMSys3.exe" "C:\tools\EMSys3_unpacked.exe" -Force
   & "C:\tools\upx-5.2.1-win64\upx.exe" -d "C:\tools\EMSys3_unpacked.exe"
   ```
   Resultado: ~333 MB descompactado, linguagem `x86:LE:32:default:borlanddelphi`.

2. **Timeout padrão (330s) é curto demais** — o binário tem ~142.500 funções e ~496.000 strings; a primeira análise completa do Ghidra pode levar bem mais de 1h. Sempre setar `REA_GHIDRA_STARTUP_TIMEOUT_MS` alto (ex: 4h) e rodar em background.

3. **`--snapshot` só acelera a MESMA consulta repetida**, não uma consulta de tipo diferente no mesmo binário. Cada novo tipo de pergunta (ex: primeiro `inspect`, depois `search`) dispara reimportação/reanálise completa de novo. Para perguntas rápidas (ex: achar strings), prefira escanear o `.exe` descompactado diretamente (Node/PowerShell), sem passar pelo Ghidra, e só usar o Ghidra quando precisar de pseudocódigo/decompilação de uma função específica.

4. **Processo AutoSystem pode travar o Ghidra no Windows**: `C:\autosystem\main.exe` (sistema fiscal/PDV de posto, legítimo — não é malware) às vezes mantém um handle aberto direto em `AppData\Local`, o que falha o self-test nativo do REA (`ghidra-native_authority`) com erro de sharing violation. Se `rea doctor` reportar esse erro, feche o AutoSystem e rode `rea doctor` de novo para confirmar.

5. Snapshot salvo em `C:\tools\EMSys3_snapshot.json` (resultado do `binary_overview`, ~14 KB).

## Achados sobre o mecanismo de licença (`.lic`)

Baseado em varredura de strings/RTTI do Delphi (nomes de classes continuam embutidos mesmo compilado) — **inferência estrutural, não o algoritmo decompilado linha a linha**:

- **Formato**: classes de XML Data Binding do Delphi (`TXMLCnpj`, `TXMLCnpjList`, `TXMLTcSoftwareCnpj`, `TXMLTcSoftwareCnpjList`, interfaces `IXMLCnpj*`) indicam que o conteúdo lógico da licença é **XML com a lista de CNPJs autorizados**.
- **Criptografia**: classe `CipherLicense`/`FCipherLicense` — o `.lic` em disco é criptografado, não é o XML puro.
- **Hashes**: `MD5FromFile`, `MD5FromString`, `GenerateKeyMD5`, `FMD5Hash`, `THash_CRC32` — prováveis candidatos para derivação de chave e/ou checksum de integridade.
- **Ativação por CNPJ**: `ativarCnpj`, `gravaInformacaoCnpj`, `gravaInformacaoCnpj2`.
- **Checagem "light"**: `FindLicencaLight` / `FindLicencaLight_Specified`.
- **Servidor de licença remoto**: `doPostLicenseServer`, `possuiCadastroLicenseServer`, família `WSLicenca*` (Web Service) — sugere validação/renovação online além do arquivo local.

Para ir além (algoritmo exato de `CipherLicense`), seria necessário decompilar essa função específica no Ghidra (nova passada de análise, ~30-60+ min).

## Popular FAQ de erros do EMSys3 (`intranet.faq`)

Pipeline completo pra extrair as mensagens de erro reais do binário (código-fonte das triggers
PL/pgSQL embutido como string no `.exe`), gerar resolução técnica e inserir na tela
`https://painel.digitalrf.com.br/painel/intranet/faq` (tabela `intranet.faq`, colunas
`nom_sistema, des_assunto, des_erro, des_resolucao, usuario_cadastro, criado_em`).

### Scripts prontos (persistentes em `C:\tools`)

```powershell
$env:NODE_PATH = "C:\Linx\cliente\digitalrf\projeto\digitalrf-help\node_modules"  # pro 'pg' resolver
& "C:\tools\node24\node.exe" "C:\tools\emsys3-build-faq.js"     # gera C:\tools\EMSys3_faq_profissional.json
& "C:\tools\node24\node.exe" "C:\tools\emsys3-insert-faq.js"    # insere o JSON gerado em intranet.faq
& "C:\tools\node24\node.exe" "C:\tools\emsys3-verify-faq.js"    # confirma contagem + amostra
& "C:\tools\node24\node.exe" "C:\tools\emsys3-delete-faq.js"    # remove so as linhas importadas por este pipeline
```

`emsys3-delete-faq.js` filtra por `usuario_cadastro = 'Importacao automatica (analise EMSys3 via REA)'`
— seguro re-rodar (apaga só o que o próprio pipeline inseriu, nunca dados de outra origem). Sempre
rodar o delete antes de reinserir uma nova versão, pra não duplicar.

### Como o `emsys3-build-faq.js` funciona

1. Lê `C:\tools\EMSys3_unpacked.exe` (binário descompactado, ver seção UPX acima) byte a byte.
2. Extrai strings decodificando **UTF-8 primeiro, CP1252 como fallback** por run de bytes candidatos
   — nunca decodificar o arquivo inteiro de uma vez como Latin1 puro, gera mojibake (`Ã£` no lugar de
   `ã`) porque o binário mistura texto ANSI legado com UTF-8 em blocos diferentes.
3. Filtra por `RAISE\s+EXCEPTION|EXCEPTION E\d{4,5}` **case-insensitive** — o código real usa
   `raise exception`, `Raise exception` e `RAISE EXCEPTION` inconsistentemente; regex sem `/i` perde
   boa parte das mensagens (bug encontrado e corrigido: subiu de 295 para 450 mensagens só com isso).
4. Pra cada mensagem, extrai também um trecho bruto (~320 chars) do código-fonte da trigger
   imediatamente anterior (mesmo buffer, mesma decodificação UTF-8/CP1252) e tenta reconhecer uma
   condição (`campo = 'valor'`, `campo <> 'valor'`, `campo IN (...)`) pra montar uma frase mais
   específica. **Mesmo sem condição reconhecida, o trecho bruto sempre é anexado à resolução** — é
   isso que evita respostas genéricas demais (ver "Lição" abaixo).
5. Deduplica por uma chave "esqueleto" (minúsculas, sem acento, sem qualquer caractere não
   alfanumérico) com pontuação negativa forte pra variantes com resíduo de mojibake — garante que a
   versão limpa/acentuada sempre vence contra uma versão corrompida da mesma mensagem.
6. Aplica overrides de conhecimento **verificado de verdade** (não inferido) pra mensagens que batem
   com casos reais já documentados nas skills do cliente Dunapetrol (`C:\Linx\cliente\danapetro\AS\.claude\skills\`,
   principalmente `erro-tipo-cobranca-emsys-gestao` e `db-dunapetrol`) — hoje cobre "Tipo de
   conbranca... nao configurado", "Pessoa nao configurada como cliente", "Fechamento de
   Caixa(Turno) nao localizado", e enriquece "Alteracao de status invalida para o fechamento de
   caixa" com os valores reais confirmados de `ind_status` (`I,A,F,C,D,R`).
7. Sanitiza pra LATIN1 reaproveitando a mesma lógica de `lib/sanitize-text.ts` do projeto (o banco
   do digitalrf-help é LATIN1; textos com travessão/aspas curvas/etc quebram o INSERT se não
   sanitizar antes — erro visto: `character ... has no equivalent in encoding "LATIN1"`).

### Lição principal (feedback do usuário, 2026-10-16)

A primeira versão gerava resolução só com frases genéricas tipo "revise os dados informados" quando
não achava uma condição `campo = 'valor'` reconhecível (~46% dos casos). Usuário achou vago. Correção:
sempre anexar o trecho real do código-fonte da trigger (cru, rotulado como "extração automática, pode
conter ruído de formatação") em vez de só a frase genérica — mesmo sem conseguir interpretar
automaticamente a condição, o trecho real já ajuda muito mais que uma frase canned. Resultado: 0 das
450 ficou só com texto genérico sem nenhum contexto técnico concreto por trás.

### Cruzamento com conhecimento real do cliente

As skills em `C:\Linx\cliente\danapetro\AS\.claude\skills\` (projeto AS/EMSys3 do cliente Dunapetrol)
têm diagnósticos reais já resolvidos em produção — muito mais confiáveis que inferência automática.
Relevantes pra FAQ de erros: `erro-tipo-cobranca-emsys-gestao` (erros do painel de integração EMSys
Gestão), `db-dunapetrol` (schema do banco AS/Autosystema), `diagnostico-saldo-estoque-emsys3`,
`ajuste-forma-pagto-especie-emsys3`. Ao reprocessar o FAQ no futuro, vale reconferir essas skills por
novos casos documentados e adicionar mais overrides em `VERIFIED_RESOLUTIONS` (dentro de
`emsys3-build-faq.js`).

## Notificação por WhatsApp ao terminar análise

Config WPPConnect real (produção) — buscar em `whatsapp_config` no banco (colunas `evolution_api_url`, `evolution_api_key`, `evolution_instance`), **não versionar a secret key em texto puro**:
- URL: `https://wppconnect-server-production-d6f6.up.railway.app`
- Instância/sessão: `DRF`
- Número padrão de aviso: `5534991745039`

Fluxo: gera token via `POST /api/<instancia>/<secret>/generate-token`, depois `POST /api/<instancia>/send-message` com `Authorization: Bearer <token>` e body `{phone, message, isGroup:false}` (ver `lib/whatsapp.ts` do projeto para a implementação de referência).
