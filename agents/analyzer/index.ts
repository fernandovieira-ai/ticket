import Anthropic from '@anthropic-ai/sdk';
import { SISTEMA_ANALISADOR } from './prompts';
import type { AnalisarErroInput, AnalisarErroOutput } from '../core/types';

export async function analisarErro(input: AnalisarErroInput): Promise<AnalisarErroOutput> {
  if (process.env.AGENT_CORE_URL) {
    return analisarViaAgentCore(process.env.AGENT_CORE_URL, input);
  }
  return analisarDireto(input);
}

// Retry com backoff para erros transitórios (rate limit 429, sobrecarga 529).
// Ficou mais necessário depois que a investigação passou a disparar várias chamadas
// extras à API por erro analisado.
async function criarMensagemComRetry(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  tentativas = 3,
): Promise<Anthropic.Message> {
  let ultimoErro: any;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await client.messages.create(params);
    } catch (e: any) {
      ultimoErro = e;
      const status = e?.status ?? e?.response?.status;
      const transitorio = status === 429 || status === 529 || status === 503;
      console.error(`[analyzer] tentativa ${i + 1}/${tentativas} falhou (status=${status ?? '?'}):`, e?.message);
      if (!transitorio || i === tentativas - 1) break;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i)); // 1s, 2s, 4s
    }
  }
  throw ultimoErro;
}

async function analisarViaAgentCore(baseUrl: string, input: AnalisarErroInput): Promise<AnalisarErroOutput> {
  const res = await fetch(`${baseUrl}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as any;
    throw new Error(`agent-core ${res.status}: ${err?.error ?? 'erro desconhecido'}`);
  }
  const parsed = await res.json() as AnalisarErroOutput;
  if (parsed.titulo?.length > 80) parsed.titulo = parsed.titulo.slice(0, 77) + '...';
  return parsed;
}

async function analisarDireto(input: AnalisarErroInput): Promise<AnalisarErroOutput> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Limita tamanho dos inputs para economizar tokens
  const descricao  = input.descricao_erro.slice(0, 500);
  const contexto   = input.contexto?.slice(0, 300);
  const stackTrace = input.stack_trace?.slice(0, 1200);

  const partes: string[] = [`Erro: ${descricao}`];
  if (contexto)   partes.push(`\nContexto: ${contexto}`);
  if (stackTrace) partes.push(`\nStack:\n${stackTrace}`);

  if (input.schema_tabelas) {
    partes.push(`\n\nSCHEMA DO CLIENTE (use para gerar SQL correto):\n${input.schema_tabelas}`);
  }

  if (input.bases_contexto?.length) {
    partes.push(
      '\n\nBASES ADICIONAIS:\n' +
      input.bases_contexto.map((b) =>
        `- ${b.nome}${b.descricao ? ` (${b.descricao})` : ''}: ${b.tabelas_relevantes}`
      ).join('\n'),
    );
  }

  if (input.dados_reais?.trim()) {
    partes.push(
      `\n\n=== DADOS REAIS DO BANCO (única fonte confiável de nomes/códigos/IDs — use para confirmar e resolver a correção, não apenas sugerir verificação) ===\n${input.dados_reais.slice(0, 4500)}\n=== FIM ===`,
    );
  }

  // Sonnet por padrão: a síntese final precisa cruzar causalidade entre várias tabelas/consultas
  // com consistência (ex: resolver código IBGE -> tabela de referência -> tabela real -> PK livre).
  // Haiku é rápido/barato mas mostrou variação de qualidade nesse tipo de raciocínio causal
  // multi-etapas — dado que a varredura já só roda 1x por erro novo (cache de propostas
  // pendentes evita reprocessar), o custo extra por erro vale a consistência.
  const model     = process.env.AI_MODEL ?? 'claude-sonnet-5';
  const maxTokens = Number(process.env.AI_MAX_TOKENS ?? 4096);

  const response = await criarMensagemComRetry(client, {
    model,
    max_tokens: maxTokens,
    system: SISTEMA_ANALISADOR,
    messages: [{ role: 'user', content: partes.join('') }],
  });

  console.log(`[analyzer] model=${model} stop=${response.stop_reason} blocks=${response.content.length}`);

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  if (!text) {
    console.error('[analyzer] resposta vazia:', JSON.stringify(response.content).slice(0, 200));
    throw new Error('Agente retornou resposta vazia');
  }

  const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/) ?? text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) {
    console.error('[analyzer] sem JSON:', text.slice(0, 300));
    throw new Error('Agente retornou formato invalido');
  }

  let parsed: AnalisarErroOutput;
  try {
    parsed = JSON.parse(jsonMatch[1]) as AnalisarErroOutput;
  } catch {
    console.error('[analyzer] JSON invalido:', jsonMatch[1].slice(0, 200));
    throw new Error('Agente retornou JSON malformado');
  }

  if (parsed.titulo?.length > 80) parsed.titulo = parsed.titulo.slice(0, 77) + '...';
  // Garante null explícito quando a IA retornar string vazia
  if (!parsed.sql_correcao?.trim()) parsed.sql_correcao = null;
  return parsed;
}
