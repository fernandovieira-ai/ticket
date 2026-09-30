// Ponto único que decide quando e como salvar aprendizado — chamado automaticamente
// pelo backend (aprovar sem SQL, ou aplicar SQL com sucesso), nunca por escolha manual
// do operador na tela. Alimenta as duas camadas de memória: agente_regras (reaplicação
// instantânea do mesmo erro exato) e agente_conhecimento (lição generalizada, deduplicada).
import { buscarLicoesRelevantes, criarOuAtualizarRegra, upsertConhecimento } from './db';
import { extrairLicao } from './licoes';
import type { AgenteProposta } from './types';

export async function salvarAprendizado(empresa_id: string, proposta: AgenteProposta): Promise<void> {
  if (!proposta.erro_hash) return;

  await criarOuAtualizarRegra(empresa_id, {
    cliente_id:        proposta.cliente_id ?? null,
    pattern:           proposta.descricao_erro.slice(0, 500),
    pattern_hash:      proposta.erro_hash,
    resumo:            proposta.titulo,
    solucao:           proposta.correcao_proposta,
    sql_correcao:      proposta.sql_correcao,
    base_alvo:         proposta.base_alvo,
    tipo:              proposta.tipo,
    nivel_risco:       proposta.nivel_risco,
    bases_consultadas: ['aprovacao'],
    confianca:         0.92, // operador validou (ou SQL rodou com sucesso) — confiança máxima
  }).catch((e) => console.error('[aprendizado] falha ao salvar regra:', e?.message));

  // Extrai a lição GENERALIZADA (sem valores específicos desta ocorrência) em paralelo —
  // não bloqueia a resposta ao operador, é permitido terminar depois.
  // O extrator vê as lições já salvas sobre o mesmo assunto para reaproveitar o tópico e mesclar o
  // resumo, em vez de criar uma linha quase duplicada (ou sobrescrever e perder o que a antiga dizia).
  buscarLicoesRelevantes(empresa_id, null, `${proposta.titulo} ${proposta.analise.slice(0, 400)}`, 8)
    .catch(() => [])
    .then((existentes) => extrairLicao(proposta, existentes))
    .then((licao) => {
      if (!licao) return;
      return upsertConhecimento(empresa_id, {
        cliente_id: null, // lição técnica generalizável: vale pra qualquer cliente
        topico:     licao.topico,
        resumo:     licao.resumo,
      });
    })
    .catch((e) => console.error('[aprendizado] falha ao consolidar conhecimento:', e?.message));
}
