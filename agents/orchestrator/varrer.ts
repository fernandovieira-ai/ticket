// Lógica de varredura automática de erros nos bancos dos clientes.
// Chamada pelo endpoint /api/agentes/varrer (manual) e /api/cron/agentes/varrer (agendado).
import { createHash } from 'node:crypto';
import pg from 'pg';
import {
  listarClientes,
  obterConfig,
  marcarUltimoScan,
  verificarAnalise,
  confirmarAtivo,
  listarBases,
  buscarRegraByHash,
  criarOuAtualizarRegra,
  incrementarUsoRegra,
  degradarRegra,
  obterPropostaParaReanalise,
  criarProposta,
  atualizarStatusProposta,
  listarConhecimentoAtivo,
  listarAguardandoComCodigoPainel,
  listarAguardandoSemCodigoPainel,
  marcarObsoleta,
} from '../core/db';
import { processarErro } from './index';
import { investigarErro, type FonteBase } from '../core/investigar';
import { descriptografar } from '../core/crypto';
import { garantirVinculo } from '../core/vinculo';
import type { BaseContexto, AnalisarErroOutput, TipoCorrecao, NivelRisco } from '../core/types';

export interface ResultadoVarredura {
  cliente_id: string;
  cliente_nome: string;
  erros_encontrados: number;
  erros_novos: number;
  erros_analisados: number;
  erros_confirmados: number; // ainda no painel, proposta já aguardando/aprovada
  erros_reanalise: number;   // foram aplicados mas voltaram, ou foram rejeitados/falharam
  erros_ignorados: number;
  erros_obsoletos: number;  // pendentes cujo erro já não existe mais no painel (resolvido por fora)
  erro?: string;
}

// Query padrão para o painel EMSys Gestão (situacao=3 = erro, reprocessar=false = ainda aberto)
// SET client_encoding='LATIN1' evita erro "invalid byte sequence for UTF8" em bancos com dados LATIN1
const PAINEL_LIMIT = 20;
const QUERY_BUILTIN_PAINEL = `
  SET client_encoding = 'LATIN1';
  SELECT
    codigo::text                                      AS codigo_painel,
    retorno                                          AS descricao,
    ('Caixa: ' || caixa || ' | MLID: ' || mlid
     || ' | Data: ' || TO_CHAR(data, 'DD/MM/YYYY'))  AS contexto,
    NULL::text                                        AS stack
  FROM exchange_emsys_gestao_monitoramento_pend
  WHERE situacao = 3 AND (reprocessar IS NULL OR reprocessar = false)
  ORDER BY data DESC
  LIMIT ${PAINEL_LIMIT}
`;

// Normaliza texto para LATIN1: decodifica bytes LATIN1 mal interpretados como UTF-8,
// e substitui caracteres fora do range LATIN1 (ex: U+FFFD, em-dash, smart quotes) por '?'
function sanitizarTexto(s: string): string {
  // Recupera caracteres LATIN1 que foram mal decodificados como UTF-8 pelo node-postgres
  // (pg recebe bytes LATIN1 e trata como latin1/binary → precisamos re-interpretar)
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const cp = s.codePointAt(i)!;
    if (cp > 0xFFFF) { i++; } // surrogate pair
    if (cp === 0xFFFD || cp > 0xFF) {
      out += '?';
    } else {
      out += String.fromCodePoint(cp);
    }
  }
  return out;
}

function hashErro(descricao: string): string {
  return createHash('sha256').update(descricao.trim().toLowerCase()).digest('hex').slice(0, 32);
}

async function buscarErrosCliente(cliente: {
  db_host: string; db_porta: number; db_nome: string;
  db_usuario: string; db_senha: string;
  query_erros: string | null; analise_painel: boolean;
}): Promise<Array<{ descricao: string; contexto?: string; stack?: string; codigo_painel?: string }>> {
  const pgClient = new pg.Client({
    host:     cliente.db_host,
    port:     cliente.db_porta,
    database: cliente.db_nome,
    user:     cliente.db_usuario,
    password: descriptografar(cliente.db_senha),
    connectionTimeoutMillis: 8000,
    ssl: false,
  });

  await pgClient.connect();
  try {
    // Prioridade: query customizada > painel builtin
    const sql = cliente.query_erros?.trim() || (cliente.analise_painel ? QUERY_BUILTIN_PAINEL : null);
    if (!sql) return [];

    // A query do painel envia SET antes do SELECT — executa em bloco
    const statements = sql.split(';').map((s) => s.trim()).filter(Boolean);
    let rows: any[] = [];
    for (const stmt of statements) {
      const result = await pgClient.query(stmt);
      if (result.rows?.length > 0) rows = result.rows;
    }

    return rows.map((r: any) => ({
      descricao:     sanitizarTexto(String(r.descricao ?? r.erro ?? r.mensagem ?? r.message ?? '')),
      contexto:      r.contexto ? sanitizarTexto(String(r.contexto)) : undefined,
      stack:         r.stack ?? r.stack_trace ? sanitizarTexto(String(r.stack ?? r.stack_trace)) : undefined,
      codigo_painel: r.codigo_painel != null ? String(r.codigo_painel) : undefined,
    })).filter((r) => r.descricao.length >= 10);
  } finally {
    await pgClient.end().catch(() => {});
  }
}

/**
 * Verifica, direcionadamente (por código, não pela lista limitada do scan geral),
 * quais dos códigos informados AINDA estão pendentes no painel (situacao=3,
 * reprocessar=false). Retorna null em caso de falha de conexão/query — nesse caso
 * o chamador deve tratar como "não sei" e não marcar nada como obsoleto.
 */
async function verificarCodigosAindaAtivos(
  cliente: { db_host: string; db_porta: number; db_nome: string; db_usuario: string; db_senha: string },
  codigos: string[],
): Promise<Set<string> | null> {
  if (codigos.length === 0) return new Set();

  const pgClient = new pg.Client({
    host: cliente.db_host, port: cliente.db_porta, database: cliente.db_nome,
    user: cliente.db_usuario, password: descriptografar(cliente.db_senha),
    connectionTimeoutMillis: 8000, ssl: false,
  });

  try {
    await pgClient.connect();
    const result = await pgClient.query(
      `SELECT codigo::text AS codigo FROM exchange_emsys_gestao_monitoramento_pend
       WHERE codigo = ANY($1::bigint[]) AND situacao = 3 AND (reprocessar IS NULL OR reprocessar = false)`,
      [codigos],
    );
    return new Set(result.rows.map((r: any) => String(r.codigo)));
  } catch (e: any) {
    console.error('[varrer] falha ao verificar códigos ativos no painel:', e?.message);
    return null;
  } finally {
    await pgClient.end().catch(() => {});
  }
}

// Conecta a uma base adicional e coleta informações de schema para enriquecer o contexto
async function coletarContextoBase(base: {
  db_host: string; db_porta: number; db_nome: string;
  db_usuario: string; db_senha: string; db_schema: string;
  nome: string; descricao: string | null;
}, palavrasChave: string[]): Promise<BaseContexto | null> {
  const pgClient = new pg.Client({
    host:     base.db_host,
    port:     base.db_porta,
    database: base.db_nome,
    user:     base.db_usuario,
    password: descriptografar(base.db_senha),
    connectionTimeoutMillis: 6000,
    ssl: false,
  });

  try {
    await pgClient.connect();

    // Busca tabelas relevantes baseadas nas palavras-chave do erro
    const filtros = palavrasChave
      .slice(0, 5)
      .map((_, i) => `table_name ILIKE $${i + 2}`)
      .join(' OR ');

    const tablesQuery = filtros
      ? `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND (${filtros})
         LIMIT 10`
      : `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 LIMIT 15`;

    const params: string[] = [base.db_schema || 'public', ...palavrasChave.slice(0, 5).map((k) => `%${k}%`)];
    const { rows } = await pgClient.query(tablesQuery, params);

    const tabelasEncontradas = rows.map((r: any) => r.table_name).join(', ');

    return {
      nome:               base.nome,
      descricao:          base.descricao,
      tabelas_relevantes: tabelasEncontradas || '(sem tabelas relevantes encontradas)',
    };
  } catch (e: any) {
    console.error(`[varrer] erro ao coletar contexto da base ${base.nome}:`, e?.message);
    return null;
  } finally {
    await pgClient.end().catch(() => {});
  }
}

// Coleta definições de colunas das tabelas mais relevantes do banco principal do cliente.
// Ajuda a IA gerar SQL correto ao analisar erros.
async function coletarSchemaPrincipal(cliente: {
  db_host: string; db_porta: number; db_nome: string;
  db_usuario: string; db_senha: string; db_schema: string;
}, palavrasChave: string[]): Promise<string> {
  if (!palavrasChave.length) return '';

  const pgClient = new pg.Client({
    host:     cliente.db_host,
    port:     cliente.db_porta,
    database: cliente.db_nome,
    user:     cliente.db_usuario,
    password: descriptografar(cliente.db_senha),
    connectionTimeoutMillis: 6000,
    ssl: false,
  });

  try {
    await pgClient.connect();
    const schema = cliente.db_schema || 'public';

    // Localiza até 5 tabelas cujo nome contenha alguma palavra-chave
    const condicoes = palavrasChave.slice(0, 5)
      .map((_, i) => `t.table_name ILIKE $${i + 2}`)
      .join(' OR ');
    const params: string[] = [schema, ...palavrasChave.slice(0, 5).map((k) => `%${k}%`)];

    const { rows: tabelas } = await pgClient.query(
      `SELECT DISTINCT t.table_name FROM information_schema.tables t
       WHERE t.table_schema = $1 AND (${condicoes}) LIMIT 5`,
      params,
    );

    if (!tabelas.length) return '';

    // Para cada tabela encontrada, lista nome:tipo das colunas
    const parts: string[] = [];
    for (const { table_name } of tabelas) {
      const { rows: cols } = await pgClient.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schema, table_name],
      );
      if (!cols.length) continue;
      const defs = cols.map((c: any) =>
        `  ${c.column_name} ${c.data_type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}`
      ).join('\n');
      parts.push(`TABLE ${table_name}:\n${defs}`);
    }

    return parts.join('\n\n');
  } catch {
    return '';
  } finally {
    await pgClient.end().catch(() => {});
  }
}

function extrairPalavrasChave(descricao: string): string[] {
  // Remove stopwords e extrai tokens relevantes para busca de tabelas
  const stopwords = new Set(['de', 'do', 'da', 'em', 'e', 'o', 'a', 'para', 'com', 'no', 'na', 'ao', 'the', 'of', 'in', 'is', 'not', 'found']);
  return descricao
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stopwords.has(w))
    .slice(0, 8);
}

export async function varrerClientes(empresa_id: string): Promise<ResultadoVarredura[]> {
  const [clientes, config] = await Promise.all([
    listarClientes(empresa_id),
    obterConfig(empresa_id),
  ]);

  if (!config?.ativo) {
    return [];
  }

  // Inclui clientes com query customizada OU com análise de painel ativa
  const ativos = clientes.filter((c) => c.ativo && (c.query_erros || c.analise_painel));

  // Lições generalizadas de correções já aprovadas — reusadas em toda a varredura desta empresa
  const licoesAprendidas = await listarConhecimentoAtivo(empresa_id)
    .then((ls) => ls.map((l) => l.resumo))
    .catch(() => [] as string[]);
  const resultados: ResultadoVarredura[] = [];

  for (const cliente of ativos) {
    const resultado: ResultadoVarredura = {
      cliente_id:        cliente.id,
      cliente_nome:      cliente.nome,
      erros_encontrados: 0,
      erros_novos:       0,
      erros_analisados:  0,
      erros_confirmados: 0,
      erros_reanalise:   0,
      erros_ignorados:   0,
      erros_obsoletos:   0,
    };

    // Trava de segurança: só opera no cliente se AS e EMSys3 forem comprovadamente da mesma empresa (CNPJ)
    const vinculo = await garantirVinculo(cliente.id, empresa_id);
    if (!vinculo.ok) {
      resultado.erro = `Vínculo AS x EMSys3 não validado: ${vinculo.erro}`;
      console.error(`[varrer] ${cliente.nome} ignorado — ${resultado.erro}`);
      resultados.push(resultado);
      continue;
    }

    try {
      const erros = await buscarErrosCliente(cliente);
      resultado.erros_encontrados = erros.length;

      // Propostas pendentes cujo erro pode ter sido resolvido por fora do sistema (ex:
      // alguém corrigiu manualmente no painel AS) — verifica direcionadamente por código,
      // nunca inferindo pela lista de 20 mais recentes do scan geral (perderia pendências
      // mais antigas que ainda são válidas). Só faz sentido pro painel builtin.
      if (cliente.analise_painel) {
        const pendentesComCodigo = await listarAguardandoComCodigoPainel(empresa_id, cliente.id).catch(() => []);
        if (pendentesComCodigo.length > 0) {
          const codigosAtivos = await verificarCodigosAindaAtivos(cliente, pendentesComCodigo.map((p) => p.painel_codigo));
          if (codigosAtivos) {
            for (const p of pendentesComCodigo) {
              if (!codigosAtivos.has(p.painel_codigo)) {
                await marcarObsoleta(p.id, empresa_id).catch(() => {});
                resultado.erros_obsoletos++;
              }
            }
          }
          // codigosAtivos === null → falha ao verificar; não mexe em nada (mais seguro
          // deixar pendente do que marcar obsoleto por engano numa falha de conexão)
        }

        // Propostas antigas (anteriores ao campo painel_codigo) ou vindas de análise
        // manual não têm código pra checar direcionadamente. Único jeito é comparar o
        // hash do erro contra a lista de erros atualmente ativos — só é seguro fazer
        // isso quando o scan trouxe TODOS os erros ativos (erros.length < PAINEL_LIMIT);
        // se bateu no limite, a lista pode estar incompleta e um "não achei" não prova
        // que o erro sumiu, então não arrisca marcar nada.
        if (erros.length < PAINEL_LIMIT) {
          const pendentesSemCodigo = await listarAguardandoSemCodigoPainel(empresa_id, cliente.id).catch(() => []);
          if (pendentesSemCodigo.length > 0) {
            const hashesAtivos = new Set(erros.map((e) => hashErro(e.descricao)));
            for (const p of pendentesSemCodigo) {
              if (p.erro_hash && !hashesAtivos.has(p.erro_hash)) {
                await marcarObsoleta(p.id, empresa_id).catch(() => {});
                resultado.erros_obsoletos++;
              }
            }
          }
        }
      }

      // Carrega bases adicionais deste cliente (ex: emsys3)
      const basesAdicionais = await listarBases(cliente.id, empresa_id).catch(() => []);
      const basesAtivas = basesAdicionais.filter((b) => b.ativo);

      for (const erro of erros) {
        const hash = hashErro(erro.descricao);
        const existente = await verificarAnalise(empresa_id, hash);

        // Contexto extra para re-análise (quando correção anterior não funcionou)
        let ehReanalise = false;
        let contextoReanalise: string | undefined;

        if (existente) {
          switch (existente.status) {
            case 'aguardando':
            case 'aprovada':
              // Proposta já pendente → confirma que ainda está no painel, não gasta token
              await confirmarAtivo(existente.id, empresa_id);
              resultado.erros_confirmados++;
              continue;

            case 'aplicada': {
              // SQL aplicado mas erro voltou → correção não funcionou
              ehReanalise = true;
              resultado.erros_reanalise++;
              const anterior = await obterPropostaParaReanalise(existente.id).catch(() => null);
              if (anterior) {
                const linhas = [
                  `[RE-ANÁLISE: correção anterior foi aplicada mas o erro persiste no painel]`,
                  `Correção tentada: ${anterior.correcao_proposta}`,
                ];
                if (anterior.sql_correcao) linhas.push(`SQL executado: ${anterior.sql_correcao}`);
                linhas.push('Sugira uma abordagem diferente da tentativa anterior.');
                contextoReanalise = linhas.join('\n');
              }
              // Degrada a regra que não funcionou para não ser reutilizada
              await degradarRegra(empresa_id, hash).catch(() => {});
              console.log(`[varrer] erro reapareceu após correção (${cliente.nome}): ${erro.descricao.slice(0, 80)}`);
              break;
            }

            case 'rejeitada':
              // Foi rejeitada → nova tentativa com abordagem diferente
              ehReanalise = true;
              resultado.erros_reanalise++;
              contextoReanalise = '[RE-ANÁLISE: proposta anterior foi rejeitada. Sugira abordagem diferente.]';
              break;

            case 'falhou':
              // Aplicação falhou (erro de SQL) → re-analisa
              ehReanalise = true;
              resultado.erros_reanalise++;
              contextoReanalise = '[RE-ANÁLISE: tentativa anterior de aplicar SQL falhou. Revise a correção.]';
              break;
          }
        }

        if (!ehReanalise) resultado.erros_novos++;

        // Knowledge base: usa regra aprendida APENAS se não for re-análise
        // (em re-análise a regra pode ser a que não funcionou)
        if (!ehReanalise) {
          const regraConhecida = await buscarRegraByHash(empresa_id, hash);
          if (regraConhecida && regraConhecida.confianca >= 0.85) {
            await incrementarUsoRegra(empresa_id, hash);

            // pattern_hash é hash exato de descricao_erro → mesmo erro literal reapareceu.
            // Se já temos um SQL aprovado por humano pra esse erro exato, reaplica DIRETO,
            // sem chamar IA de novo (essa é a "memória" real: aprender uma vez, reusar sempre).
            if (regraConhecida.sql_correcao) {
              try {
                const analise: AnalisarErroOutput = {
                  titulo:             regraConhecida.resumo,
                  analise:            `[Reaplicado de regra aprendida — aprovada anteriormente pelo operador, confiança ${regraConhecida.confianca}] ${regraConhecida.resumo}`,
                  correcao_proposta:  regraConhecida.solucao,
                  sql_correcao:       regraConhecida.sql_correcao,
                  base_alvo:          regraConhecida.base_alvo ?? 'principal',
                  tipo:               (regraConhecida.tipo ?? 'dados') as TipoCorrecao,
                  nivel_risco:        (regraConhecida.nivel_risco ?? 'medio') as NivelRisco,
                  confianca:          regraConhecida.confianca,
                };
                const proposta = await criarProposta(
                  empresa_id, erro.descricao, analise,
                  { id: cliente.id, nome: cliente.nome }, hash, erro.codigo_painel,
                );
                const deveAutoAprovar =
                  config?.ativo === true &&
                  analise.nivel_risco !== 'critico' &&
                  config.auto_aprovar_tipos.includes(analise.tipo);
                if (deveAutoAprovar) {
                  await atualizarStatusProposta(proposta.id, empresa_id, 'aprovada');
                }
                resultado.erros_analisados++;
              } catch (e: any) {
                console.error(`[varrer] erro ao reaplicar regra (SQL salvo) ${cliente.nome}:`, e?.message);
              }
              continue;
            }

            // Sem SQL salvo (regra antiga ou aprendida de erro que não tinha SQL) — usa o
            // resumo como contexto e ainda chama a IA pra derivar a correção.
            try {
              await processarErro({
                empresa_id,
                descricao_erro: erro.descricao,
                contexto:       `[Regra conhecida] ${regraConhecida.resumo}\n${erro.contexto ?? ''}`,
                stack_trace:    erro.stack,
                cliente_id:     cliente.id,
                erro_hash:      hash,
                codigo_painel:  erro.codigo_painel,
              });
              resultado.erros_analisados++;
            } catch (e: any) {
              console.error(`[varrer] erro ao aplicar regra ${cliente.nome}:`, e?.message);
            }
            continue;
          }
        }

        // Coleta contexto das bases adicionais + schema do banco principal
        const palavras = extrairPalavrasChave(erro.descricao);

        let basesContexto: BaseContexto[] = [];
        if (basesAtivas.length > 0) {
          const contextos = await Promise.all(
            basesAtivas.map((b) => coletarContextoBase(b, palavras)),
          );
          basesContexto = contextos.filter((c): c is BaseContexto => c !== null);
        }

        const schemaPrincipal = await coletarSchemaPrincipal(cliente, palavras);

        // Monta contexto final: re-análise tem prioridade, depois contexto do erro original
        const contextoFinal = contextoReanalise
          ? [contextoReanalise, erro.contexto].filter(Boolean).join('\n\n')
          : erro.contexto;

        // Investiga contra o(s) banco(s) real(is) antes de analisar — evita respostas
        // genéricas tipo "verificar se existe" e resolve a causa raiz com dados reais.
        const fontes: FonteBase[] = [
          { nome: 'principal', config: cliente },
          ...basesAtivas.map((b) => ({ nome: b.nome, config: b })),
        ];
        const dadosReais = await investigarErro(
          erro.descricao,
          'Investigar a causa raiz e reunir os dados reais necessários para uma correção definitiva e pronta para executar — sem intervenção manual depois.',
          contextoFinal ?? '',
          fontes,
          { maxIteracoes: 10, licoes: licoesAprendidas, cache: { cliente_id: cliente.id, empresa_id } },
        ).catch((e: any) => {
          console.error(`[varrer] investigação falhou para ${cliente.nome}:`, e?.message);
          return '';
        });

        try {
          const proposta = await processarErro({
            empresa_id,
            descricao_erro:  erro.descricao,
            contexto:        contextoFinal,
            stack_trace:     erro.stack,
            cliente_id:      cliente.id,
            erro_hash:       hash,
            bases_contexto:  basesContexto.length > 0 ? basesContexto : undefined,
            schema_tabelas:  schemaPrincipal || undefined,
            dados_reais:     dadosReais || undefined,
            codigo_painel:   erro.codigo_painel,
          });

          // Atualiza a regra aprendida (ou cria nova) com a nova análise
          if (proposta?.proposta.analise) {
            const baseNomes = basesContexto.map((b) => b.nome);
            await criarOuAtualizarRegra(empresa_id, {
              cliente_id:        cliente.id,
              pattern:           erro.descricao.slice(0, 500),
              pattern_hash:      hash,
              resumo:            proposta.proposta.titulo,
              solucao:           proposta.proposta.correcao_proposta,
              bases_consultadas: ['principal', ...baseNomes],
              // Re-análise começa com confiança menor (precisa ser validada)
              confianca: ehReanalise ? 0.65
                : proposta.proposta.nivel_risco === 'baixo'  ? 0.90
                : proposta.proposta.nivel_risco === 'medio'  ? 0.80
                : 0.70,
            }).catch(() => {});
          }

          resultado.erros_analisados++;
        } catch (e: any) {
          console.error(`[varrer] erro ao analisar para ${cliente.nome}:`, e?.message);
        }
      }

      await marcarUltimoScan(cliente.id);
    } catch (e: any) {
      resultado.erro = e?.message ?? 'Falha ao conectar';
      console.error(`[varrer] falha no cliente ${cliente.nome}:`, e?.message);
    }

    resultados.push(resultado);
  }

  return resultados;
}
