// Autonomia progressiva: o agente só aplica SQL sozinho para uma FAMÍLIA de erros (assinatura) que já
// foi resolvida com sucesso CONFIRMADO vezes suficientes — "confirmado" = o SQL rodou E o erro sumiu
// do painel depois. Recaída, SQL que falha ou rejeição do operador zeram a confiança da família.
import {
  obterAutonomia, contarAplicacoesDoAgente24h, registrarFalhaAutonomia, registrarSucessoAutonomia,
  listarAplicadasNaoConfirmadas, marcarConfirmada,
} from './db';
import { aplicarProposta, somenteInsertOuUpdate } from './aplicar';
import { assinaturaErro, hashErro } from './assinatura';
import { situacaoCodigosPainel } from './painel';
import type { AgenteConfig, AgenteProposta } from './types';

/** Tempo mínimo entre aplicar e confirmar: dá ao painel EMSys Gestão tempo de reprocessar a linha. */
export const CARENCIA_CONFIRMACAO_MIN = 60;

export interface ResultadoAutoAplicacao {
  aplicada: boolean;
  motivo: string;
}

/**
 * Tenta aplicar a proposta sem operador. Só aplica se TODAS as condições valerem; caso contrário
 * devolve o motivo e a proposta segue o fluxo normal (aguardando/aprovada).
 */
export async function tentarAutoAplicar(
  empresa_id: string,
  proposta: AgenteProposta,
  config: AgenteConfig | null,
): Promise<ResultadoAutoAplicacao> {
  const nao = (motivo: string): ResultadoAutoAplicacao => ({ aplicada: false, motivo });

  if (!config?.ativo) return nao('agente desligado');
  if (!proposta.sql_correcao?.trim() || !proposta.cliente_id) return nao('proposta sem SQL/cliente');
  if (proposta.nivel_risco !== 'baixo' && proposta.nivel_risco !== 'medio') return nao(`risco ${proposta.nivel_risco}`);
  if (!somenteInsertOuUpdate(proposta.sql_correcao)) return nao('SQL não é somente INSERT/UPDATE');

  const assinatura = assinaturaErro(proposta.descricao_erro);
  const confianca = await obterAutonomia(empresa_id, assinatura.hash);

  // Tipo de erro marcado pelo operador para execução automática: dispensa a autonomia geral e a contagem
  // de sucessos. Sem a marcação, só a autonomia geral (desligada por padrão) pode aplicar, e só após N sucessos.
  const marcado = confianca?.auto_aplicar === true;
  if (!marcado && !config.autonomia_ativa) return nao('tipo de erro não marcado para execução automática');

  if (confianca && confianca.falhas_consecutivas > 0) {
    return nao(`família com ${confianca.falhas_consecutivas} falha(s) recente(s) — exige operador até novos sucessos confirmados`);
  }
  if (!marcado) {
    const minimo = Math.max(1, config.autonomia_min_sucessos);
    if (!confianca || confianca.sucessos_confirmados < minimo) {
      return nao(`família ainda sem ${minimo} sucesso(s) confirmado(s) (tem ${confianca?.sucessos_confirmados ?? 0})`);
    }
  }

  const usadas = await contarAplicacoesDoAgente24h(empresa_id);
  if (usadas >= config.autonomia_limite_diario) return nao(`limite diário atingido (${usadas}/${config.autonomia_limite_diario})`);

  const r = await aplicarProposta(empresa_id, proposta.id, { tipo: 'agente' });
  if (r.ok) {
    console.log(`[autonomia] proposta ${proposta.id} aplicada pelo agente (${marcado ? 'tipo marcado pelo operador' : 'autonomia progressiva'}) — "${assinatura.normalizada.slice(0, 80)}"`);
    return { aplicada: true, motivo: 'aplicada' };
  }

  // 500 = o SQL falhou no banco do cliente; 422 = não afetou linha nenhuma. Ambos mostram que a
  // correção gerada pra esta família não serve — volta a exigir operador. As demais recusas
  // (trava de segurança, vínculo, base) não dizem nada sobre a qualidade da correção.
  if (r.status === 500 || r.status === 422) {
    await registrarFalhaAutonomia(empresa_id, assinatura).catch(() => {});
  }
  return nao(r.erro);
}

/**
 * Confirma as correções aplicadas que de fato resolveram: o erro sumiu. Cada confirmação soma um
 * sucesso para a família do erro — é assim que o agente "conquista" a autonomia.
 * Não confirma nada quando não dá pra ter certeza (falha ao consultar, lista de erros incompleta).
 */
export async function confirmarAplicadas(
  empresa_id: string,
  cliente: { id: string; db_host: string; db_porta: number; db_nome: string; db_usuario: string; db_senha: string },
  erros: Array<{ descricao: string }>,
  listaDeErrosCompleta: boolean,
): Promise<number> {
  const pendentes = await listarAplicadasNaoConfirmadas(empresa_id, cliente.id, CARENCIA_CONFIRMACAO_MIN).catch(() => []);
  if (pendentes.length === 0) return 0;

  const codigos = pendentes.flatMap((p) => (p.painel_codigo ? [p.painel_codigo] : []));
  const situacoes = codigos.length ? await situacaoCodigosPainel(cliente, codigos) : new Map();
  const hashesAtivos = listaDeErrosCompleta ? new Set(erros.map((e) => hashErro(e.descricao))) : null;

  let confirmadas = 0;
  for (const p of pendentes) {
    let resolvido: boolean | null = null; // null = ainda não dá pra dizer

    if (p.painel_codigo) {
      if (!situacoes) continue;
      const s = situacoes.get(p.painel_codigo);
      if (!s) resolvido = true;                                  // linha saiu do painel
      else if (s.situacao === 3) resolvido = s.reprocessar ? null : false; // 3+reprocessar = ainda na fila do painel
      else resolvido = true;                                     // saiu do estado de erro
    } else if (hashesAtivos && p.erro_hash) {
      resolvido = !hashesAtivos.has(p.erro_hash);
    }

    if (resolvido !== true) continue; // false = recaída, tratada no fluxo normal da varredura

    try {
      await marcarConfirmada(p.id, empresa_id);
      await registrarSucessoAutonomia(empresa_id, assinaturaErro(p.descricao_erro));
      confirmadas++;
    } catch (e: any) {
      console.error('[autonomia] falha ao registrar confirmação:', e?.message);
    }
  }
  return confirmadas;
}
