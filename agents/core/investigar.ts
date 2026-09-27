// Investigação automática contra o banco real do cliente: um loop agentic (tool use)
// onde a IA decide UMA query SELECT por vez, vê o resultado real, e decide a próxima —
// em vez de gerar todas as queries "às cegas" de uma vez (que se mostrou pouco confiável
// para investigações multi-etapas, ex: resolver código IBGE → tabela de referência →
// tabela real → PK livre). Usado tanto na varredura automática quanto no refinamento manual.
import Anthropic from '@anthropic-ai/sdk';
import pg from 'pg';
import { descriptografar } from './crypto';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Retry com backoff para erros transitórios (rate limit 429, sobrecarga 529/503)
async function criarMensagemComRetry(
  params: Anthropic.MessageCreateParamsNonStreaming,
  tentativas = 3,
): Promise<Anthropic.Message> {
  let ultimoErro: any;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await anthropic.messages.create(params);
    } catch (e: any) {
      ultimoErro = e;
      const status = e?.status ?? e?.response?.status;
      const transitorio = status === 429 || status === 529 || status === 503;
      console.error(`[investigar] tentativa ${i + 1}/${tentativas} falhou (status=${status ?? '?'}):`, e?.message);
      if (!transitorio || i === tentativas - 1) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
  throw ultimoErro;
}

export type DbConfig = {
  db_host: string; db_porta: number; db_nome: string;
  db_usuario: string; db_senha: string;
};

export interface FonteBase {
  nome: string;
  config: DbConfig;
}

export interface OpcoesInvestigacao {
  /** Máximo de chamadas à ferramenta executar_select (padrão 10) */
  maxIteracoes?: number;
  /** Lições generalizadas de correções já aprovadas (agente_conhecimento), injetadas no prompt */
  licoes?: string[];
}

const FERRAMENTA_SELECT: Anthropic.Tool = {
  name: 'executar_select',
  description:
    'Executa UMA consulta SELECT contra o banco de dados real do cliente e retorna o resultado (até 12 linhas). ' +
    'Use para descobrir schema (information_schema), resolver códigos de referência, ler código-fonte de functions/procedures, ' +
    'e reunir os valores reais e exatos necessários para montar uma correção definitiva.',
  input_schema: {
    type: 'object',
    properties: {
      base: { type: 'string', description: 'Nome exato da base a consultar, copiado literalmente da lista de bases disponíveis.' },
      sql: { type: 'string', description: 'Um único comando SELECT (sem ";" no meio, sem múltiplos statements).' },
      descricao: { type: 'string', description: 'O que esta query verifica (curto, usado como legenda do resultado).' },
    },
    required: ['base', 'sql', 'descricao'],
  },
};

function montarSystemPrompt(bases_disponiveis: string[], maxIteracoes: number, licoes: string[]): string {
  const blocoLicoes = licoes.length
    ? `\nLIÇÕES APRENDIDAS (de correções já aprovadas por operadores neste sistema — aplique se forem relevantes a este erro):\n${licoes.map((l) => `- ${l}`).join('\n')}\n`
    : '';

  return `Você é DBA sênior investigando um erro de produção para montar uma correção DEFINITIVA e pronta para executar — sem exigir mais nenhuma investigação manual depois de você.

Você tem a ferramenta "executar_select" e um orçamento de até ${maxIteracoes} chamadas a ela. Investigue PASSO A PASSO: chame a ferramenta com UMA query, observe o resultado real, e só então decida a próxima query — nunca assuma o resultado de uma query antes de rodá-la.
${blocoLicoes}
BASES DISPONÍVEIS: ${bases_disponiveis.join(', ')}
- A base "principal" é o banco de dados principal do cliente, mas muitas vezes é só o banco do painel de monitoramento — as tabelas/functions de negócio (vendas, cadastro de cliente, nota fiscal, estoque etc.) costumam estar em OUTRA base disponível (ex: nome contendo "emsys"). Não assuma que está em "principal" — descubra.
- Se uma query falhar com "relation does not exist" ou "function does not exist" numa base, tente a MESMA busca em outra base disponível.

REGRAS DE INVESTIGAÇÃO (genéricas — conhecimento específico deste negócio/sistema vem do bloco LIÇÕES APRENDIDAS acima, quando houver):
- Se o erro menciona um código de qualquer natureza "não encontrado", NÃO assuma o que o código significa ou como está formatado/codificado — investigue a(s) tabela(s) de referência corretas antes de tirar conclusões.
- Nunca assuma que duas colunas com nomes parecidos (ex: dois campos "código de X" em tabelas diferentes) usam a mesma numeração/convenção — confirme cada uma na sua própria tabela de referência antes de comparar ou cruzar valores entre elas.
- Se uma busca por um valor não retornar nada, considere que o dado pode estar formatado/decomposto de outra forma (partes separadas, tamanho diferente, com/sem prefixo) antes de concluir que o registro não existe — investigue a estrutura real antes de desistir.
- Se uma busca retornar MAIS DE UM registro quando se esperava um só, procure uma coluna de status/nível/tipo na mesma tabela que ajude a desambiguar qual é o registro correto — não escolha arbitrariamente nem deixe a ambiguidade sem resolver.
- Se não tiver certeza do nome exato de tabela/coluna, rode uma query em information_schema.columns ANTES de assumir nomes — nunca adivinhe um nome de coluna sem checar.
- Se o erro vem de uma function/procedure PL/pgSQL, o código-fonte dela costuma revelar exatamente qual tabela/coluna ela usa: "SELECT prosrc, pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'nome_da_function' LIMIT 1". NUNCA use cast tipo "'nome'::regprocedure"/"::regproc" sem saber a assinatura exata — costuma falhar.
- Busque também registros semelhantes/vizinhos já cadastrados (mesma UF, categoria etc.) para confirmar o padrão de cadastro, e o próximo valor de PK livre (MAX) se a correção provável for um INSERT.
- Cada chamada à ferramenta deve conter EXATAMENTE UM comando SELECT (sem ";" separando múltiplos statements).

CHECKLIST OBRIGATÓRIO ANTES DE PARAR — se a correção mais provável for um INSERT, as DUAS ÚLTIMAS chamadas da sua investigação (antes de encerrar) DEVEM SER, nessa ordem, mesmo que você ache que já sabe a resposta:
1. "SELECT MAX(coluna_pk) FROM tabela_alvo" — pra saber o próximo valor livre (PK confirmada + 1). NUNCA escreva "próximo disponível" sem ter rodado essa query.
2. "SELECT * FROM tabela_alvo WHERE <mesma categoria/UF/grupo> LIMIT 3" — um exemplo real já cadastrado, pra saber quais colunas preencher e com quais valores/defaults (ex: colunas que sempre ficam 0/NULL nesse padrão de cadastro).
Só responda em texto (sem chamar a ferramenta de novo) DEPOIS de ter o resultado real dessas duas. Se você tem orçamento sobrando e ainda não rodou as duas, isso é um erro — rode agora antes de concluir.

QUANDO PARAR: assim que tiver dados reais suficientes para confirmar a causa raiz E os valores exatos (nomes, códigos, IDs, próximo PK livre etc.) necessários para um SQL de correção definitivo — pare de chamar a ferramenta e responda com um resumo em texto contendo EXPLICITAMENTE cada valor confirmado (nome do registro, PK livre, colunas/valores do exemplo semelhante), pronto para virar um INSERT/UPDATE sem mais nenhuma pergunta. Não gaste chamadas além do necessário, mas também não pare cedo demais deixando a causa raiz sem confirmação real.`;
}

// Executa SELECT de forma segura numa conexão já aberta
async function executarQuerySegura(client: pg.Client, sql: string): Promise<string> {
  let sqlLimpo = sql.trim();
  if (!/^\s*SELECT\s/i.test(sqlLimpo)) {
    return '(bloqueado: apenas SELECT é permitido)';
  }

  // Remove ";" final — a IA às vezes termina o SQL com ponto-e-vírgula, o que
  // quebrava a sintaxe ao anexarmos " LIMIT n" depois (ex: "...WHERE x = 'y'; LIMIT 12")
  sqlLimpo = sqlLimpo.replace(/;\s*$/, '');

  // Bloqueia múltiplos statements (qualquer ";" remanescente no meio da query)
  if (sqlLimpo.includes(';')) {
    return '(bloqueado: múltiplos statements não são permitidos — use uma única instrução SELECT)';
  }

  // Só remove um LIMIT já existente se estiver no final da query
  // (evita remover por engano o LIMIT de uma subquery no meio do SQL)
  const semLimitFinal = sqlLimpo.replace(/\bLIMIT\s+\d+\s*$/i, '').trim();
  const sqlFinal = `${semLimitFinal} LIMIT 12`;

  try {
    const result = await client.query(sqlFinal);
    if (!result.rows.length) return '(nenhum registro encontrado)';
    const linhas = result.rows
      .map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v ?? 'null'}`).join(' | '))
      .join('\n');
    return linhas.length > 1600 ? linhas.slice(0, 1600) + '\n...(truncado)' : linhas;
  } catch (e: any) {
    return `(erro ao executar: ${e?.message ?? 'desconhecido'})`;
  }
}

/**
 * Investiga um erro contra o(s) banco(s) real(is) do cliente através de um loop
 * agentic: a IA decide uma query por vez (tool use), vê o resultado real, e decide
 * a próxima — até ter dados suficientes ou esgotar o orçamento de iterações.
 * Retorna o texto consolidado dos dados reais para alimentar a análise final.
 */
export async function investigarErro(
  descricao_erro: string,
  instrucao: string,
  contexto_extra: string,
  fontes: FonteBase[],
  opcoes: OpcoesInvestigacao = {},
): Promise<string> {
  const { maxIteracoes = 10, licoes = [] } = opcoes;
  const nomesBasesDisponiveis = fontes.map((f) => f.nome);
  if (nomesBasesDisponiveis.length === 0) return '';

  const transcript: string[] = [];
  const conexoes = new Map<string, pg.Client>();

  const resolverFonte = (base: string): FonteBase | null => {
    const exata = fontes.find((f) => f.nome === base);
    if (exata) return exata;
    const aproximada = fontes.find(
      (f) =>
        f.nome.toLowerCase().includes(base.toLowerCase()) ||
        base.toLowerCase().includes(f.nome.toLowerCase()),
    );
    return aproximada ?? null;
  };

  // Reaproveita 1 conexão por base durante toda a investigação (evita reconectar a cada query)
  const obterConexao = async (fonte: FonteBase): Promise<pg.Client | null> => {
    const chave = `${fonte.config.db_host}:${fonte.config.db_porta}:${fonte.config.db_nome}`;
    const existente = conexoes.get(chave);
    if (existente) return existente;

    const client = new pg.Client({
      host: fonte.config.db_host, port: fonte.config.db_porta, database: fonte.config.db_nome,
      user: fonte.config.db_usuario, password: descriptografar(fonte.config.db_senha),
      connectionTimeoutMillis: 8000, ssl: false,
      statement_timeout: 10000, // evita query travada consumindo o tempo da investigação inteira
      query_timeout: 12000,
    });
    try {
      await client.connect();
      conexoes.set(chave, client);
      return client;
    } catch (e: any) {
      console.error(`[investigar] falha ao conectar na base "${fonte.nome}":`, e?.message);
      return null;
    }
  };

  const userInicial = [
    `ERRO: ${descricao_erro.slice(0, 600)}`,
    `\nINSTRUÇÃO/OBJETIVO: ${instrucao.slice(0, 500)}`,
    contexto_extra.trim()
      ? `\n\n=== FATOS JÁ CONFIRMADOS EM INVESTIGAÇÃO(ÕES) ANTERIOR(ES) ===\n${contexto_extra.slice(0, 1800)}\n=== FIM ===\nTrate os fatos acima como verdadeiros e já confirmados — NÃO gaste chamadas reconfirmando o que já está aqui, e NÃO contradiga/substitua um valor já confirmado (ex: um código já achado) a menos que uma nova query mostre evidência concreta em contrário. Use seu orçamento para resolver especificamente o que a INSTRUÇÃO/OBJETIVO pede além disso, e para preencher lacunas que os fatos acima deixaram em aberto.`
      : '',
    '\n\nComece investigando.',
  ].join('');

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userInicial }];
  const system = montarSystemPrompt(nomesBasesDisponiveis, maxIteracoes, licoes);

  try {
    for (let i = 0; i < maxIteracoes; i++) {
      let response: Anthropic.Message;
      try {
        response = await criarMensagemComRetry({
          model: 'claude-sonnet-5',
          max_tokens: 1024,
          system,
          tools: [FERRAMENTA_SELECT],
          messages,
        });
      } catch (e: any) {
        console.error(`[investigar] falha na iteração ${i + 1}:`, e?.message ?? e);
        break;
      }

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      );
      if (toolUses.length === 0) break; // modelo decidiu que a investigação está completa

      messages.push({ role: 'assistant', content: response.content });

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const input = tu.input as { base?: string; sql?: string; descricao?: string };
        const base = String(input.base ?? '');
        const sql = String(input.sql ?? '');
        const descricao = String(input.descricao ?? 'consulta');

        let resultado: string;
        const fonte = resolverFonte(base);
        if (!fonte) {
          resultado = `Base "${base}" não encontrada. Bases disponíveis: ${nomesBasesDisponiveis.join(', ')}`;
        } else {
          const client = await obterConexao(fonte);
          resultado = client
            ? await executarQuerySegura(client, sql)
            : `Falha ao conectar na base "${base}".`;
        }

        console.log(`[investigar] iteração ${i + 1}, base "${base}": ${sql.slice(0, 150)}`);
        console.log(`[investigar] resultado: ${resultado.slice(0, 200).replace(/\n/g, ' | ')}`);

        transcript.push(`[${descricao}]\nBase: ${base} | SQL: ${sql}\nResultado:\n${resultado}`);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: resultado.slice(0, 1600),
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }
  } finally {
    for (const client of conexoes.values()) {
      await client.end().catch(() => {});
    }
  }

  return transcript.join('\n\n');
}
