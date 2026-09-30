// Extrai uma lição generalizada e deduplicável de uma proposta aprovada — o padrão
// técnico reutilizável (ex: "código IBGE = UF+município, checar tab_municipio_ibge"),
// sem os valores específicos daquela ocorrência (ex: sem o código IBGE exato).
// Alimenta agente_conhecimento, que é injetado no prompt de investigação de erros futuros.
import Anthropic from '@anthropic-ai/sdk';
import type { AgenteProposta } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface LicaoExtraida {
  topico: string; // slug curto e estável, usado para deduplicar (ex: "ibge_municipio_tab_cidade")
  resumo: string; // a lição em si, curta e sem valores específicos de uma ocorrência
}

export interface LicaoExistente {
  topico: string;
  resumo: string;
}

export async function extrairLicao(
  proposta: AgenteProposta,
  existentes: LicaoExistente[] = [],
): Promise<LicaoExtraida | null> {
  // O slug do tópico é a chave de deduplicação. Se o modelo inventar um slug novo a cada vez, o mesmo
  // assunto vira várias linhas — por isso ele vê as lições já salvas e decide reaproveitar/mesclar.
  const blocoExistentes = existentes.length
    ? `\nLIÇÕES JÁ SALVAS QUE PODEM SER DO MESMO ASSUNTO:\n${existentes
        .map((l) => `- topico "${l.topico}": ${l.resumo.slice(0, 300)}`)
        .join('\n')}\n
- Se a nova lição REFINA, COMPLETA ou CORRIGE uma das lições salvas acima, REUTILIZE EXATAMENTE o "topico" dela e devolva em "resumo" o texto JÁ MESCLADO (mantenha o que continua válido da lição antiga e incorpore o que a nova acrescenta — não perca informação útil).
- Se a nova lição é de outro assunto, crie um "topico" novo.\n`
    : '';

  const prompt = `Você mantém uma base de conhecimento técnico enxuta e sem repetição. Abaixo está uma correção de erro que um operador acabou de aprovar:

TÍTULO: ${proposta.titulo}
ANÁLISE: ${proposta.analise.slice(0, 800)}
CORREÇÃO: ${proposta.correcao_proposta.slice(0, 800)}
SQL APLICADO: ${proposta.sql_correcao ? proposta.sql_correcao.slice(0, 500) : '(nenhum)'}
${blocoExistentes}
Extraia APENAS a lição técnica GENERALIZÁVEL desta correção — o padrão/regra de negócio que ajuda a resolver QUALQUER erro semelhante no futuro, não os detalhes desta ocorrência específica.

REGRAS:
- NÃO inclua valores específicos desta ocorrência (códigos exatos, IDs, nomes próprios específicos) — só o PADRÃO (ex: "código IBGE = 2 dígitos UF + 5 dígitos município, tabela X guarda só os 5 dígitos" é generalizável; "o código 4217204 é São Miguel do Oeste" NÃO é, é específico demais).
- Se a correção não tiver nenhuma lição técnica generalizável (foi um caso pontual/único, sem padrão reaproveitável), responda exatamente: null
- "topico" deve ser um slug curto e estável (snake_case, até 60 chars) que identifique esse TIPO de padrão — para que correções futuras do mesmo tipo caiam no mesmo tópico e apenas reforcem/atualizem esta lição em vez de criar uma nova.
- "resumo" deve ter no máximo 400 caracteres, direto, em português técnico.

Responda APENAS com JSON: {"topico":"...","resumo":"..."} ou null`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content.find((b) => b.type === 'text')?.text?.trim() ?? 'null';
    if (text === 'null' || text.startsWith('null')) return null;

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as LicaoExtraida;
    if (!parsed.topico || !parsed.resumo) return null;

    return {
      topico: parsed.topico.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 60),
      resumo: parsed.resumo.slice(0, 400),
    };
  } catch (e: any) {
    console.error('[licoes] falha ao extrair lição:', e?.message ?? e);
    return null;
  }
}
