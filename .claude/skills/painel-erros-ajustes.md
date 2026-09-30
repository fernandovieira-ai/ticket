# Painel de Erros — Ajustes Automáticos (Agentes IA)

## 📋 Visão Geral
**Área:** Módulo Agentes IA (`agents/`, `app/painel/intranet/agentes/`, `app/api/agentes/`)
**Status:** 🟢 CONSTRUÍDO (pagamento e estoque testados com dado real só-leitura; escrita testada em Postgres local descartável; nunca aplicado em produção)
**Última atualização:** 29/09/2026

## 🎯 Objetivo
Documentar a arquitetura do Painel de Erros e dos "ajustes determinísticos" (pagamento, estoque) para
quem for adicionar um novo tipo de ajuste, mexer na análise por IA, ou depurar por que um erro não está
sendo classificado/ajustado do jeito esperado. Ler isto ANTES de mexer nesses arquivos evita redescobrir
decisões já tomadas (e os motivos, que nem sempre são óbvios olhando só o código).

## 🗺️ Mapa dos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `agents/core/classificar.ts` | Classifica o texto bruto do erro (`retorno`) em `{categoria, causa, detalhe, risco}`. Onde ficam as regex de parsing (`RE_SALDO`, `parseSaldoInsuficiente`) e as constantes de categoria (`CATEGORIA_SALDO_ADIANTAMENTO`, `CATEGORIA_SALDO_PRODUTO_LOJA`). |
| `agents/core/regras-painel.ts` | **O que fazer** com cada categoria — `ModoRegraPainel`, tabela `agente_regras_painel` (editável por empresa via API), `DEFAULTS` embutidos. Categoria sem linha na tabela usa o default. |
| `agents/core/painel-erros.ts` | Lê o painel (`exchange_emsys_gestao_monitoramento_pend`) e monta `ErroPainel[]` já com `modo` resolvido. Cache de 45s por cliente. `almoxarifadosDe()`, `lerLinhasPorCodigo()`, `reprocessarPainel()`, `codEmpresaPorCnpj()` são reaproveitados pelos módulos de ajuste — `codEmpresaPorCnpj()` é **obrigatório** sempre que um ajuste precisar do `cod_empresa` real do EMSys3 (ver armadilha abaixo). Desde 29/09/2026 o `detalhe` de "Saldo insuficiente" não vem mais só do texto do erro: `quantidadeRealDaVenda()` (classificar.ts) pega a "baixa" do JSON `conteudo` da venda, e `lerErrosPainel()` consulta `saldoRealAteData()` (uma vez por combinação única empresa·item·almoxarifado·data, capado em `LIMITE_SALDO_REAL`) pra mostrar o saldo ATUAL do EMSys3 em vez do saldo congelado no momento do erro. |
| `agents/core/saldo-estoque.ts` | Só `saldoRealAteData()` (chama `sp_obtem_saldo_item_qtde` do EMSys3) — extraído de `ajuste-estoque.ts` em 29/09/2026 pra `painel-erros.ts` poder chamar sem criar import circular. Reaproveitado por `ajuste-estoque.ts`, `conferir-combustivel.ts` e `painel-erros.ts`. |
| `agents/core/padroes-cliente.ts` | Tabela ÚNICA e genérica (`agente_cliente_padrao`: empresa_id+cliente_id+chave+valor JSONB) pra guardar "o candidato que sempre uso nesta base" (tipo de movimento de entrada, forma de pagamento, e qualquer ajuste novo que tiver um "sempre pergunta") — evita criar uma migration/tabela por tipo de ajuste. `obterPadraoCliente()`/`definirPadraoCliente()`/`limparPadraoCliente()`/`listarPadroesCliente()`. Sempre por CLIENTE, nunca só empresa_id: os candidatos vêm do catálogo do EMSys3 de CADA cliente. |
| `agents/core/ajuste-pagamento.ts` | Ajuste **determinístico**, sem IA: troca `formaPagto` (tipo AC) no JSON da venda e reprocessa. Exporta `preparar()`, `novoClient()`, `normalizar()` — reaproveitados por `ajuste-estoque.ts`. Forma de pagamento padrão da base via `obterFormaPagtoPadrao()`/`definirFormaPagtoPadrao()`/`limparFormaPagtoPadrao()` (`padroes-cliente.ts`, chave `CHAVE_FORMA_PAGAMENTO_AJUSTE`). |
| `agents/core/ajuste-estoque.ts` | Ajuste **determinístico**, sem IA: lança entrada de estoque cobrindo o déficit real e reprocessa. Mesmo padrão de `ajuste-pagamento.ts`. Quantidade necessária vem de `quantidadeRealDaVenda()` (JSON da venda), não do texto do erro; saldo real vem de `saldoRealAteData()` (`saldo-estoque.ts`); tipo de movimento padrão via `obterTipoMovimentoPadrao()`/etc. (`padroes-cliente.ts`, chave `CHAVE_TIPO_MOVIMENTO_ESTOQUE`). `aplicarAjusteEstoque()` aceita `tipoMovimento: null` quando a prévia só tem `semDeficit` (nada a inserir, não precisa perguntar). |
| `agents/core/conferir-combustivel.ts` | **Só leitura, nunca ajusta nada** (29/09/2026): combustível é medição física do tanque, o painel não pode inventar o valor. Reconfirma o saldo real por tanque/item (`saldoRealAteData()`) contra a quantidade real da venda pendente (`quantidadeRealDaVenda()`, não o texto do erro) e devolve `pendentes`/`prontos` — um veredito de "já dá pra reprocessar" ou não, sem lançar entrada nem tocar em nada. |
| `agents/core/investigar.ts` | Loop agentic (tool-use) que investiga o(s) banco(s) reais do cliente pra alimentar a análise por IA. É aqui que ficam as regras genéricas de investigação e o system prompt. |
| `agents/orchestrator/varrer.ts` | Varredura automática de fundo (cron). Lê o painel, classifica cada erro e **pula os que têm ação própria** (`MODOS_SEM_ANALISE_IA`) antes de gastar IA. |
| `agents/orchestrator/analisar-grupo.ts` | Análise por IA de um GRUPO selecionado na tela (botão "Ajustar em massa"). Mesmo gate de `MODOS_SEM_ANALISE_IA`. |
| `app/painel/intranet/agentes/painel/painel-client.tsx` | UI do painel de uma base: lista/matriz de erros, gaveta de ajuste em massa. `ajustar_estoque`/`ajustar_pagamento` são componentes próprios (`AjusteEstoqueBloco`/`AjustePagamentoBloco`, 29/09/2026): recalculam a prévia assim que montam (não esperam o operador escolher o candidato) e reaproveitam o padrão salvo da base quando existe. Botão "Padrões desta base" (`PadroesBaseDrawer`) lista/limpa o que está salvo em `agente_cliente_padrao`. |
| `app/painel/intranet/agentes/painel/painel-home.tsx` + `painel-pagina.tsx` + `[id]/page.tsx` | Tela principal (card por base com erro) → página própria por base (não é mais modal). |
| `app/painel/intranet/agentes/propostas/*` | Tela antiga de propostas (SQL gerado por IA), usa `agentes-client.tsx`. Também ganhou o bloco inline de ajuste de pagamento no refinamento. |

## 🧩 Arquitetura de regras: `ModoRegraPainel`

```ts
'somente_reprocessar'   // nunca ajustado (ex: Combustível) — só marca reprocessar=true
                        //   (Combustível especificamente ganha um botão extra "Conferir saldo real do
                        //   tanque" na tela — chama conferir-combustivel.ts, só leitura, mostra veredito)
'ajustar_pagamento'     // ação própria: troca forma de pagamento e reprocessa
'ajustar_estoque'       // ação própria: lança entrada de estoque e reprocessa
'elegivel_automatico'   // IA analisa; após 1ª aprovação pode marcar pra rodar sozinho
'assistido'             // IA analisa, sempre aguardando aprovação
'manual'                // sem regra própria — fallback genérico
```

`MODOS_SEM_ANALISE_IA = ['somente_reprocessar', 'ajustar_pagamento', 'ajustar_estoque']` — categorias
nesse array **nunca** devem chamar a IA. Esse array é consultado em 3 lugares e os 3 precisam continuar
sincronizados quando um modo novo for criado:
1. `agents/core/regras-painel.ts` (fonte da verdade)
2. `agents/orchestrator/analisar-grupo.ts` (gate do "Ajustar em massa" manual)
3. `agents/orchestrator/varrer.ts` (gate da varredura automática — **foi o ponto que faltava** até
   28/09/2026; a varredura lia o mesmo painel e chamava IA sem saber dessas regras)

Cliente do painel-client.tsx tem sua própria cópia local de `MODOS_SEM_ANALISE` (não pode importar
`regras-painel.ts` porque ele puxa `@/lib/db` — módulo server-only, quebra o bundle do client). **Sempre
que adicionar um modo novo ao array do servidor, adicionar também no array duplicado do client.**

### Como adicionar um novo modo determinístico (ex: um 4º tipo de ajuste)
1. Adicionar o valor em `ModoRegraPainel` (regras-painel.ts) + no `CHECK` constraint do banco (nova
   migration `ALTER TABLE agente_regras_painel DROP/ADD CONSTRAINT ...`, ver `add_agente_regras_painel_ajustar_estoque.sql`
   como exemplo).
2. Adicionar ao `MODOS_SEM_ANALISE_IA` (server) e ao `MODOS_SEM_ANALISE` (client, duplicado).
3. Criar `agents/core/ajuste-<nome>.ts` seguindo o padrão de `ajuste-pagamento.ts`/`ajuste-estoque.ts`:
   `preparar()` (reaproveitar o de `ajuste-pagamento.ts`, já exportado) → ler linhas pendentes
   (`lerLinhasPorCodigo`) → **reclassificar no servidor** e recusar o lote inteiro se algum código não
   for da categoria esperada (nunca confiar na categoria que o client mandou) → função de prévia (não
   escreve nada) → função de aplicar (transação, e por fim `reprocessarPainel()`).
4. 3 rotas API (`GET`/busca de catálogo se precisar, `POST` prévia, `POST` aplicar) — copiar os 3
   arquivos de `app/api/agentes/painel-erros/ajuste-pagamento/`.
5. UI: bloco inline em `painel-client.tsx` dentro do `.map(planos)`, condicionado a
   `es.modo === "ajustar_<nome>"` — copiar o bloco de `ajustar_pagamento`.
6. Atualizar o `DEFAULTS` em `regras-painel.ts` se a categoria já existir em `classificar.ts`.

## 🔬 Pipeline de análise por IA (quando o modo NÃO é determinístico)

Dois pontos de entrada, mesmo pipeline:
- **Manual/grupo**: `analisar-grupo.ts` → `analisarComIA` (varrer.ts, `automatico: false`)
- **Automático**: `varrer.ts` (loop de fundo) → `analisarComIA` (`automatico: true`, aprende regra e pode auto-aplicar)
- **Refinamento de proposta existente**: `app/api/agentes/propostas/[id]/refinar/route.ts` → chama
  `investigarErro` direto (não passa por `analisarComIA`)

Todos os três chamam `investigarErro()` (`agents/core/investigar.ts`), que:
1. Injeta `LIÇÕES APRENDIDAS` relevantes (`buscarLicoesRelevantes`, busca full-text em `agente_conhecimento`)
2. Roda um loop agentic de até 10 `executar_select` (a IA decide a query, vê o resultado real, decide a próxima)
3. Tem uma **REGRA CRÍTICA** (adicionada 28/09/2026): se a conclusão da IA seria "falta rodar uma consulta
   real de X", isso é tratado como ação pendente dela mesma — ela é instruída a rodar a query, não só
   descrever que falta. Antes disso, uma rodada de refinamento podia terminar com 0 chamadas à ferramenta,
   só reafirmando em texto o que já faltava antes.
4. Devolve o texto consolidado, que alimenta `analisarComDadosReais` (refinar) ou `analisarErro`
   (`agents/analyzer/`) — os dois têm a MESMA regra anti-alucinação: nunca citar nome/código/ID que não
   apareceu literalmente nos DADOS REAIS, nunca escrever SQL condicional, calcular valores derivados
   (ex: MAX+1) você mesmo.

### Lições gravadas em `agente_conhecimento` (28/09/2026)
Tabela é `empresa_id` + `cliente_id` (NULL = vale pra qualquer cliente da empresa) + `topico` + `resumo`
(≤400 chars, texto puro ASCII — caracteres especiais tipo en-dash "–" quebram porque a coluna é gravada
como LATIN1-safe via `latin1Safe()`). Duas lições específicas de EMSys3/estoque:

- `emsys3_saldo_item_estoque_sp_obtem_saldo`: usar `sp_obtem_saldo_item_qtde`/`sp_obtem_saldo_item_valor`
  pra saldo real, e o sinal correto (`tab_tipo_movimento_estoque.ind_tipo_movimento = 'E'` → +1, senão −1).
- `emsys3_saldo_produto_loja_insert_entrada_inventario`: pra "Saldo insuficiente · Produto de loja"
  (nunca combustível), propor um INSERT em `tab_movimento_estoque` (tipo 2 = ENTRADA POR INVENTARIO na
  maioria dos casos) em vez de só relatar o problema.
- `erro_pessoa_nao_cliente_emsys3` (reforçada 29/09/2026): erro "Pessoa não configurada como cliente(X)"
  vem de `sp_int_gera_venda()` checando `tab_pessoa.ind_cliente='S'`. **Não propor só
  `UPDATE tab_pessoa SET ind_cliente='S'`** — antes de concluir, SEMPRE checar também
  `tab_pessoa_cliente WHERE cod_pessoa=X` e `tab_pessoa_cliente_empresa WHERE cod_pessoa=X`: a tela de
  cadastro do EMSys3 que marca "Cliente" não mexe só no flag, também grava/depende de linhas nessas duas
  tabelas. Só é seguro propor apenas o UPDATE do flag se as 2 tabelas já tiverem linha pra essa pessoa
  (só faltava marcar o flag); se estiverem vazias, é preciso investigar o schema delas e um exemplo de
  cliente real já cadastrado antes de montar a correção completa (flag + INSERTs necessários).

Essas lições valem pro pipeline de IA (Propostas/refinar/varredura). O ajuste de estoque **determinístico**
(`ajuste-estoque.ts`) não depende delas — já tem a lógica embutida em código, sem IA.

## ⚠️ Armadilhas já encontradas (não repetir)

- **`LinhaPainel.empresa` (coluna `empresa` da fila do AS) NÃO é o `cod_empresa` do EMSys3** (achado
  29/09/2026, ao construir a conferência de combustível): são numerações sem relação nenhuma — um caso
  real tinha `empresa` = "30351405" no AS e `cod_empresa` = 105 no EMSys3 (CNPJs completamente
  diferentes). `ajuste-estoque.ts` usava `l.empresa` direto como `cod_empresa` em `tab_movimento_estoque`/
  `tab_item_empresa` (e até no INSERT da entrada!) — nunca deu problema em produção só porque a escrita
  nunca foi aplicada de verdade lá (só testada local). Corrigido: `lerLinhasPorCodigo()` agora também
  extrai o CNPJ (14 dígitos) do JSON `conteudo` da venda, e `codEmpresaPorCnpj()` (painel-erros.ts) cruza
  esse CNPJ com `tab_empresa.num_cnpj` pra achar o `cod_empresa` real — **qualquer ajuste novo que precise
  do `cod_empresa` do EMSys3 tem que passar por `codEmpresaPorCnpj()`, nunca usar `LinhaPainel.empresa`
  direto.** Lição gravada em `agente_conhecimento` como `emsys3_cod_empresa_do_as_nao_e_cod_empresa`.
- **Saldo real de estoque: chamar `sp_obtem_saldo_item_qtde(cod_empresa, item, almoxarifado, data, 'N')`
  direto, nunca reimplementar a fórmula em SQL manual** — é a function que a trigger
  `fc_tbi_tab_movimento_estoque` usa pra validar a venda, então chamar ela garante bater exatamente com o
  que a trigger vai calcular (`ajuste-estoque.ts` reimplementava a fórmula (SUM assinado) antes; hoje só
  chama a function — mesmo resultado, mas sem risco de divergir se a lógica da function mudar). Existe
  também `sp_obtem_saldo_item_valor` para o valor.
- **Os números do texto do erro (`SALDO = ...`, `QUANTIDADE BAIXA = ...`) são uma FOTO do momento da
  tentativa, não a verdade atual** (achado 29/09/2026): `SALDO` nunca muda sozinho no texto mesmo depois do
  operador lançar a entrada/medição real no EMSys3, e `QUANTIDADE BAIXA` pode não bater com a venda de
  verdade. Qualquer cálculo/exibição precisa da fonte viva: `quantidadeRealDaVenda()` (JSON `conteudo` da
  venda) pra quantidade, `saldoRealAteData()` (`sp_obtem_saldo_item_qtde`) pra saldo — nunca `info.saldoMensagem`/
  `info.quantidadeBaixa` direto de `parseSaldoInsuficiente()` fora de um fallback de último recurso.
- **`RE_SALDO` tem 5 grupos de captura** (`ITEM, Almoxarifado, DATA, SALDO, QUANTIDADE BAIXA`). Se mexer
  nessa regex, checar TODOS os usos por índice (`m[1]`, `m[2]`...) — já causou bug uma vez ao adicionar
  a captura de DATA e desalinhar os índices seguintes. Prefira sempre `parseSaldoInsuficiente()` (retorna
  objeto nomeado) em vez de indexar o match direto.
- **Sinal do saldo de estoque**: `SUM(qtd_movimento_estoque)` cru NÃO é o saldo real — precisa multiplicar
  por `POSITION('E' IN ind_tipo_movimento) * 2 - 1` (entrada=+1, saída=−1) e filtrar `dta_movimento <= data`.
  Uma investigação já concluiu "saldo divergente" com um número errado (SUM sem sinal) quando o saldo real
  (via `sp_obtem_saldo_item_qtde` ou o SUM assinado) era outro.
- **PK com generator, não serial**: várias tabelas do EMSys3 (herança Firebird) usam `gen_<tabela>` em vez
  de coluna serial — `pg_get_serial_sequence()` retorna null nelas. Usar `nextval('gen_x')` direto no
  INSERT, nunca `MAX(pk)+1` na mão (a regra genérica do checklist de `investigar.ts` pede MAX+1 pra tabelas
  comuns — para tabelas com generator isso é desnecessário e mais arriscado: cria uma janela de corrida
  entre ler o MAX e aplicar o INSERT).
- **Confirmado ao vivo, 30/09/2026 (cliente zmaisz)**: `tab_pessoa.cod_pessoa` NÃO tem generator nenhum —
  `sp_int_gera_pre_cadastro_cliente()` (chamada por `sp_int_gera_venda()` ao pré-cadastrar o cliente de uma
  venda nova) calcula `cod_pessoa = MAX(cod_pessoa) + 1` sem lock (lido o código-fonte real da function).
  Duas vendas concorrentes que precisam pré-cadastrar cliente ao mesmo tempo podem calcular o mesmo valor —
  uma grava, a outra estoura `duplicate key value violates unique constraint "tab_pessoa_pkey"`. Não é erro
  de dado: quando o painel lê o erro, o `MAX(cod_pessoa)` real já avançou (a outra venda comitou), então só
  reprocessar resolve. **Validado em produção (30/09/2026, zmaisz, código 3808976): reprocessado pela tela
  do painel, resolveu de primeira — `tab_pessoa` ganhou `cod_pessoa = 233869` ("TORRES ENGENHARIA E
  CONSULTORIA LTDA", `ind_pessoa_ativa='S'`, `ind_cliente='S'`, dados completos incluindo endereço vindo do
  XML da NF), sem precisar tocar em nada manualmente.** **Decisão do usuário (30/09/2026): não hardcodar categoria/regra nova em
  `classificar.ts`/`regras-painel.ts` para casos assim — o diagnóstico fica só como lição em
  `agente_conhecimento` (`emsys3_duplicate_key_tab_pessoa_pre_cadastro`, empresa_id do zmaisz, `cliente_id =
  NULL` — é bug estrutural da function migrada, pode acontecer em qualquer cliente com a mesma versão do
  EMSys3), pra não ficar preso a deploy.** Sem regra em código, esse erro continua caindo em "Outros"/modo
  `manual` no painel — a lição é lida por `buscarLicoesRelevantes()` quando o operador clicar "Ajustar em
  massa" → "Analisar", então a IA já entrega o diagnóstico certo (reprocessar) sem reinvestigar do zero, mas
  ainda depende dessa ação manual (não iría automaticamente pra `somente_reprocessar` sozinho). Se o MESMO
  código continuar falhando repetidas vezes (não só uma), não é mais corrida passageira — é sinal de
  concorrência constante e precisa acionar o fabricante do EMSys3 para tornar a function atômica (lock de
  linha ou sequence dedicada), nunca tentar editar `tab_pessoa` na mão.
- **AS Postgres não aceita `\s`/`\d` em regex de texto** — usar classes POSIX (`[[:space:]]`, `[0-9]`).
- **Sem extensão `unaccent`** em produção — normalização de acento é feita em JS via NFD + strip de
  `̀-ͯ`, nunca depender de `unaccent()` do Postgres.
- **`conteudo`/`retorno` do painel são LATIN1** — sempre `SET client_encoding = 'LATIN1'` antes de ler, e
  `sanitizarTexto()` (troca bytes fora do range por `?`) antes de exibir/gravar.
- **Nunca importar módulo server-only em `painel-client.tsx`** (usa `"use client"`) — qualquer constante
  pequena que o server também usa (ex: `MODOS_SEM_ANALISE`) precisa ser duplicada no client, não importada.
- **`descriptografar()` faz parte de `preparar()`** (`ajuste-pagamento.ts`) — nunca decriptar senha de
  cliente "na mão" em um módulo novo; sempre passar por `preparar(cliente_id, empresa_id)`, que já garante
  o vínculo AS×EMSys3 antes de liberar as credenciais.

## 🧪 Disciplina de testes desta área
- **Leitura**: pode/deve testar direto contra a base real do cliente (read-only) — é como se descobre
  schema, procedures, valores reais.
- **Escrita**: NUNCA testar `UPDATE`/`INSERT` contra a base real do cliente sem autorização explícita do
  operador para aquele caso específico. Testar a lógica de escrita contra um Postgres local descartável
  (`docker exec agent-pg psql ...`, criar role+db, schema mínimo, rodar, `DROP DATABASE`/`DROP ROLE` no
  final da mesma sequência de comandos).
- Migrations novas: aplicar primeiro no banco do `.env.local` (App usa `DATABASE_URL` mesmo em dev — hoje
  aponta pra `cloud.digitalrf.com.br:5433/drfticket`, não é um Postgres 100% local) e confirmar com o
  operador antes de aplicar em produção.
- **O `server_encoding` do banco do `.env.local` (drfticket) é LATIN1** (achado 29/09/2026 ao aplicar
  `add_agente_cliente_padrao.sql`) — não só as colunas `conteudo`/`retorno` do painel do CLIENTE, o banco
  de CONTROLE da própria aplicação também é LATIN1. Qualquer caractere fora de LATIN1 na query inteira
  (inclusive dentro de `--`/`/* */` comentário) derruba a query com "character ... has no equivalent in
  encoding LATIN1" — `SET client_encoding` não resolve, porque a conversão falha no `server_encoding`. Ao
  rodar uma migration via script (sem `psql`), envie só ASCII na query (tire acentos/emdash dos comentários
  antes de executar; o `.sql` no repositório pode manter acentos normalmente, isso só afeta a query enviada
  na hora de aplicar).

## 📦 Migrations desta área
| Arquivo | Aplicada no `.env.local`? | Aplicada em produção? |
|---|---|---|
| `add_agente_regras_painel.sql` | ✅ | ❌ |
| `add_agentes_auto_aplicar.sql` | ✅ | ❌ |
| `add_agente_regras_painel_ajustar_estoque.sql` | ✅ | ❌ |
| `add_agente_cliente_padrao.sql` | ✅ | ❌ |

## ✅ Pendências conhecidas
- [ ] Rodar as 4 migrations acima em produção antes do próximo deploy que dependa delas.
- [ ] Tela de edição de `agente_regras_painel` em Configuração (hoje só a API existe: `GET/PUT/DELETE
      /api/agentes/painel-erros/regras`).
- [ ] Testar `aplicarAjusteEstoque` ponta a ponta contra o zmaisz de verdade (com autorização) antes de
      liberar pro uso normal — só foi validado leitura real + escrita local descartável até agora.
- [ ] `PadroesBaseDrawer` (29/09/2026) só permite LIMPAR um padrão salvo — definir um padrão novo é feito
      dentro do próprio ajuste (checkbox "usar sempre" ao escolher o candidato). Se um dia fizer sentido
      definir um padrão sem passar por um ajuste em andamento, dá pra adicionar aqui.
