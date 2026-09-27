import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import { atualizarConteudoProposta, obterCliente, listarBases, listarConhecimentoAtivo } from '@/agents/core/db';
import { investigarErro, type FonteBase } from '@/agents/core/investigar';
import type { AgenteProposta, AnalisarErroOutput } from '@/agents/core/types';
import Anthropic from '@anthropic-ai/sdk';

// Refinamento usa Sonnet (ação manual do operador — qualidade > custo)
const MODELO_REFINAR = 'claude-sonnet-5';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Retry com backoff para erros transitórios (rate limit 429, sobrecarga 529/503)
async function criarMensagemComRetry(
  params: Anthropic.MessageCreateParamsNonStreaming,
  tentativas = 2,
): Promise<Anthropic.Message> {
  let ultimoErro: any;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await anthropic.messages.create(params);
    } catch (e: any) {
      ultimoErro = e;
      const status = e?.status ?? e?.response?.status;
      const transitorio = status === 429 || status === 529 || status === 503;
      console.error(`[refinar] tentativa ${i + 1}/${tentativas} falhou (status=${status ?? '?'}):`, e?.message);
      if (!transitorio || i === tentativas - 1) break;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** i));
    }
  }
  throw ultimoErro;
}

// Análise final com Sonnet + dados reais, sem truncamento, anti-alucinação
async function analisarComDadosReais(
  descricao_erro: string,
  analise_anterior: string,
  correcao_anterior: string,
  sql_anterior: string | null,
  instrucao: string,
  dadosReais: string,
): Promise<AnalisarErroOutput> {
  const temDados = dadosReais.trim().length > 0;

  const system = `Você é DBA sênior/especialista PostgreSQL escrevendo um diagnóstico técnico profissional para outro engenheiro aprovar e aplicar direto em produção.

REGRAS ANTI-ALUCINAÇÃO (críticas):
- Cite nomes próprios (cidade, cliente, produto, empresa etc.), códigos, IDs e valores SOMENTE se aparecerem literalmente nos DADOS REAIS fornecidos.
- NUNCA escreva um SQL condicional/genérico do tipo "verificar se existe, se não existir fazer X" — isso não é uma correção, é uma tarefa para o operador fazer manualmente. Use os DADOS REAIS já fornecidos para CONFIRMAR o estado atual e gerar o SQL definitivo e pronto para executar.
- Se o dado necessário não apareceu nos DADOS REAIS (ex: consulta retornou "nenhum registro encontrado" ou não foi executada), NÃO adivinhe o valor nem escreva SQL condicional — deixe sql_correcao null e escreva em "correcao_proposta" APENAS 1-2 frases curtas dizendo qual dado falta. NUNCA escreva uma lista numerada de passos/comandos para o operador executar manualmente — isso não é uma correção pronta.
- CALCULE valores derivados você mesmo em vez de deixar sql_correcao null por causa deles: se os DADOS REAIS contêm o resultado de um MAX(coluna_pk) (ex: "max_id: 5213"), o próximo valor livre é esse número + 1 — use-o diretamente no INSERT, não escreva "próximo disponível" nem deixe em aberto.
- IMPORTANTE: a tabela alvo do sql_correcao pode NÃO estar na mesma base onde o erro foi relatado — confira em qual "Base:" (nos DADOS REAIS) a query que confirmou essa tabela rodou, e copie exatamente esse nome em "base_alvo". Aplicar na base errada falha com "relation does not exist".

ESTRUTURA E TOM:
- "analise" = diagnóstico da causa raiz: o que quebrou, por que, e evidência dos dados reais que sustentam essa conclusão (até ~900 chars).
- "correcao_proposta" = solução objetiva e executável, referenciando os valores reais confirmados (até ~900 chars).
- Direto, técnico, sem enrolação — mas completo o suficiente para outro engenheiro confiar e aplicar sem re-investigar.
- Responda SOMENTE com JSON, sem texto fora do JSON:

{"titulo":"(máx 80 chars)","analise":"...","correcao_proposta":"...","sql_correcao":"..." ou null,"base_alvo":"nome exato da base, ou 'principal' se não houver sql_correcao","tipo":"configuracao|dados|codigo|infraestrutura|outro","nivel_risco":"baixo|medio|alto"}`;

  const user = [
    `ERRO: ${descricao_erro.slice(0, 500)}`,
    `\nANÁLISE ANTERIOR: ${analise_anterior.slice(0, 400)}`,
    `\nCORREÇÃO ANTERIOR: ${correcao_anterior.slice(0, 400)}`,
    sql_anterior ? `\nSQL ANTERIOR: ${sql_anterior.slice(0, 400)}` : '',
    `\nINSTRUÇÃO: ${instrucao.slice(0, 500)}`,
    temDados
      ? `\n\n=== DADOS REAIS DO BANCO (única fonte confiável de nomes/códigos/IDs) ===\n${dadosReais.slice(0, 4500)}\n=== FIM ===`
      : '\n\n[Nenhuma consulta retornou dados — não invente nomes/códigos, diga o que precisa ser consultado]',
  ].join('');

  const response = await criarMensagemComRetry({
    model: MODELO_REFINAR,
    max_tokens: 4096,
    system,
    messages: [{ role: 'user', content: user }],
  });

  console.log(`[refinar] model=${MODELO_REFINAR} stop=${response.stop_reason} dados=${temDados}`);

  if (response.stop_reason === 'max_tokens') {
    throw new Error('Resposta muito longa — reduza o contexto ou simplifique a instrução');
  }

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  if (!text) throw new Error('Modelo retornou resposta vazia');

  // Tenta extrair JSON de bloco markdown ou diretamente no texto
  const match =
    text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ??
    text.match(/(\{[\s\S]*"nivel_risco"[\s\S]*?\})/);

  if (!match) {
    console.error('[refinar] resposta sem JSON:', text.slice(0, 400));
    throw new Error('Formato inválido retornado pelo modelo');
  }

  let parsed: AnalisarErroOutput;
  try {
    parsed = JSON.parse(match[1]) as AnalisarErroOutput;
  } catch {
    console.error('[refinar] JSON malformado:', match[1].slice(0, 300));
    throw new Error('JSON malformado retornado pelo modelo');
  }

  if (parsed.titulo?.length > 80) parsed.titulo = parsed.titulo.slice(0, 77) + '...';
  if (!parsed.sql_correcao?.trim()) parsed.sql_correcao = null;
  return parsed;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const instrucao: string = body.instrucao?.trim() ?? '';
  if (!instrucao) return NextResponse.json({ error: 'Instrução obrigatória' }, { status: 400 });

  const original = await queryOne<AgenteProposta>(
    `SELECT * FROM agente_propostas WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );
  if (!original) return NextResponse.json({ error: 'Proposta não encontrada' }, { status: 404 });

  const cliente = original.cliente_id
    ? await obterCliente(original.cliente_id, session.empresaId)
    : null;

  const basesAdicionais = cliente
    ? await listarBases(cliente.id, session.empresaId).catch(() => [])
    : [];
  const basesAtivas = basesAdicionais.filter((b) => b.ativo);

  const fontes: FonteBase[] = [
    ...(cliente ? [{ nome: 'principal', config: cliente }] : []),
    ...basesAtivas.map((b) => ({ nome: b.nome, config: b })),
  ];

  const licoesAprendidas = await listarConhecimentoAtivo(session.empresaId)
    .then((ls) => ls.map((l) => l.resumo))
    .catch(() => [] as string[]);

  // Contexto da rodada anterior — inclui análise E correção (é ali que costumam ficar os
  // valores já confirmados, ex: "cod_estado=25 confirmado em tab_estado") pra não perder
  // esse trabalho a cada novo "Refinar com IA".
  const contextoRodadaAnterior = [
    original.analise,
    original.correcao_proposta,
    original.sql_correcao ? `SQL da rodada anterior: ${original.sql_correcao}` : '',
  ].filter(Boolean).join('\n\n');

  // FASE 1/2 — investiga contra o(s) banco(s) real(is), com aprofundamento automático
  const dadosReais = await investigarErro(
    original.descricao_erro,
    instrucao,
    contextoRodadaAnterior,
    fontes,
    { licoes: licoesAprendidas },
  ).catch(() => '');

  // FASE 3 — Sonnet analisa com dados reais (sem truncamento)
  let analise: AnalisarErroOutput;
  try {
    analise = await analisarComDadosReais(
      original.descricao_erro,
      original.analise,
      original.correcao_proposta,
      original.sql_correcao ?? null,
      instrucao,
      dadosReais,
    );
  } catch (e: any) {
    console.error('[refinar] erro na análise:', e?.message);
    return NextResponse.json({ error: 'Erro ao gerar análise refinada' }, { status: 500 });
  }

  // Atualiza a proposta original no lugar — nunca cria nova
  const atualizada = await atualizarConteudoProposta(id, session.empresaId, analise);
  if (!atualizada) {
    return NextResponse.json({ error: 'Falha ao atualizar proposta' }, { status: 500 });
  }

  return NextResponse.json({ proposta: atualizada });
}
