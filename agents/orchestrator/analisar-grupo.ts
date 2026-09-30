// Análise sob demanda de um GRUPO de erros do painel (tipo + causa), disparada pelo "Ajustar em massa".
// Uma investigação por grupo, não por erro: o erro mais recente representa o grupo e a IA recebe as
// estatísticas do grupo inteiro. Gera uma proposta "aguardando" — nunca aplica nem aprende sozinha.
import {
  obterConfig, obterCliente, listarBases, verificarAnalise, obterPropostaPorId, obterPropostaParaReanalise,
} from '../core/db';
import { hashErro } from '../core/assinatura';
import { descriptografar } from '../core/crypto';
import { garantirVinculo, type ConexaoCfg } from '../core/vinculo';
import { lerLinhasPorCodigo, almoxarifadosDe } from '../core/painel-erros';
import { estatisticasGrupo, classificarErro } from '../core/classificar';
import { obterRegrasPainel, resolverRegra, MODOS_SEM_ANALISE_IA } from '../core/regras-painel';
import { analisarComIA } from './varrer';
import type { AgenteProposta } from '../core/types';

export interface EntradaGrupo {
  empresa_id: string;
  cliente_id: string;
  /** Códigos do painel do grupo (a tela envia os selecionados) */
  codigos: string[];
  categoria: string;
  causa: string;
}

export interface ResultadoGrupo {
  ok: boolean;
  erro?: string;
  /** true = já existia uma proposta aberta para este erro; foi reaproveitada (sem gastar IA) */
  existente?: boolean;
  proposta?: AgenteProposta;
  /** Erros do grupo que ainda estão pendentes no painel */
  total: number;
  empresas: string[];
}

const fmtDia = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const OBJETIVO_GRUPO = (n: number) =>
  `Este erro representa um GRUPO de ${n} erros pendentes do mesmo tipo e causa (veja "ANÁLISE DE GRUPO" no contexto). ` +
  'Descubra a causa comum a todo o grupo, não só a deste exemplo: reúna dados reais que mostrem o que está errado, ' +
  'quantos registros são afetados e se um único ajuste resolve todos. Se a correção depender de um dado que não está ' +
  'nas bases, diga exatamente qual dado falta em vez de inventar valores.';

export async function analisarGrupoPainel(e: EntradaGrupo): Promise<ResultadoGrupo> {
  const vazio = (erro: string, total = 0, empresas: string[] = []): ResultadoGrupo => ({ ok: false, erro, total, empresas });

  const config = await obterConfig(e.empresa_id);
  if (!config?.ativo) return vazio('O agente está desativado. Ative em Agentes › Configurar.');

  const cliente = await obterCliente(e.cliente_id, e.empresa_id).catch(() => null);
  if (!cliente) return vazio('Cliente não encontrado.');

  const vinculo = await garantirVinculo(cliente.id, e.empresa_id);
  if (!vinculo.ok) return vazio(`Vínculo AS x EMSys3 não validado: ${vinculo.erro}`);

  let cfgAS: ConexaoCfg;
  try {
    cfgAS = { ...cliente, db_senha: descriptografar(cliente.db_senha) };
  } catch {
    return vazio('Não foi possível ler as credenciais do cliente.');
  }
  const basesAtivas = (await listarBases(cliente.id, e.empresa_id).catch(() => [])).filter((b) => b.ativo);

  // Só o que ainda está pendente no painel (pode ter sido resolvido por fora desde que a tela carregou)
  const linhas = await lerLinhasPorCodigo(cfgAS, e.codigos);
  if (!linhas.length) return vazio('Esses erros não estão mais pendentes no painel. Atualize a tela.');

  // Tipos que não passam pela análise de IA (agente_regras_painel — dado, não código): a classificação é
  // refeita aqui com as mensagens reais, sem confiar no tipo que a tela enviou.
  const baseEmsys = basesAtivas.find((b) => b.papel === 'emsys');
  const cfgEm: ConexaoCfg | null = baseEmsys ? { ...baseEmsys, db_senha: descriptografar(baseEmsys.db_senha) } : null;
  const almox = await almoxarifadosDe(cfgEm, linhas.map((l) => l.retorno));
  const tipos = linhas.map((l) => classificarErro(l.retorno, l.requisicao, almox).categoria);
  if (tipos.includes('Saldo insuficiente')) {
    return vazio('Não foi possível confirmar se este saldo de estoque é de combustível (EMSys3 indisponível). Por segurança a análise foi bloqueada.', linhas.length);
  }
  const regras = await obterRegrasPainel(e.empresa_id);
  const bloqueado = [...new Set(tipos)].map((cat) => resolverRegra(regras, cat)).find((r) => MODOS_SEM_ANALISE_IA.includes(r.modo));
  if (bloqueado) {
    return vazio(`"${bloqueado.categoria}" não passa pela análise da IA (${bloqueado.titulo}). ${bloqueado.descricao}`, linhas.length);
  }

  const rep = linhas[0]; // o mais recente
  if (rep.retorno.length < 10) return vazio('O erro mais recente do grupo não tem mensagem para analisar.');

  const porEmpresa = new Map<string, number>();
  for (const l of linhas) porEmpresa.set(l.empresa, (porEmpresa.get(l.empresa) ?? 0) + 1);
  const empresas = [...porEmpresa.keys()];
  const datas = linhas.map((l) => l.data).sort();
  const caixas = new Set(linhas.map((l) => l.caixa)).size;

  const hash = hashErro(rep.retorno);
  const existente = await verificarAnalise(e.empresa_id, hash).catch(() => null);
  if (existente && (existente.status === 'aguardando' || existente.status === 'aprovada')) {
    const proposta = await obterPropostaPorId(existente.id, e.empresa_id);
    if (proposta) return { ok: true, existente: true, proposta, total: linhas.length, empresas };
  }

  // Mesmas regras da varredura para um erro que já teve proposta antes (sem mexer na confiança da família)
  let ehReanalise = false;
  let contextoReanalise: string | undefined;
  if (existente && !(existente.status === 'aplicada' && existente.confirmado_em)) {
    ehReanalise = true;
    if (existente.status === 'aplicada') {
      const anterior = await obterPropostaParaReanalise(existente.id).catch(() => null);
      contextoReanalise = [
        '[RE-ANÁLISE: correção anterior foi aplicada mas o erro persiste no painel]',
        anterior ? `Correção tentada: ${anterior.correcao_proposta}` : '',
        anterior?.sql_correcao ? `SQL executado: ${anterior.sql_correcao}` : '',
        'Sugira uma abordagem diferente da tentativa anterior.',
      ].filter(Boolean).join('\n');
    } else if (existente.status === 'rejeitada') {
      contextoReanalise = '[RE-ANÁLISE: proposta anterior foi rejeitada. Sugira abordagem diferente.]';
    } else {
      contextoReanalise = '[RE-ANÁLISE: tentativa anterior de aplicar SQL falhou. Revise a correção.]';
    }
  }

  const amostras = [...new Set(linhas.map((l) => l.retorno.slice(0, 260)))].slice(0, 3);
  const contexto = [
    `Caixa: ${rep.caixa} | MLID: ${rep.mlid} | Data: ${fmtDia(rep.data)}`,
    '',
    `[ANÁLISE DE GRUPO] Este é o erro mais recente de ${linhas.length} pendentes do mesmo grupo.`,
    `Tipo: ${e.categoria} | Causa: ${e.causa}`,
    `Empresas do painel (código: erros): ${[...porEmpresa].map(([c, n]) => `${c}: ${n}`).join(', ')}`,
    `Período: ${fmtDia(datas[0])} a ${fmtDia(datas[datas.length - 1])} | Caixas distintos: ${caixas}`,
    estatisticasGrupo(linhas.map((l) => l.retorno)),
    amostras.length > 1 ? `Outras mensagens do grupo:\n${amostras.slice(1).map((a) => `- ${a}`).join('\n')}` : '',
  ].filter((x) => x !== '').join('\n');

  try {
    const { resultado } = await analisarComIA({
      empresa_id: e.empresa_id, config, cliente, basesAtivas,
      erro: { descricao: rep.retorno, contexto, codigo_painel: rep.codigo },
      hash, ehReanalise, contextoReanalise,
      objetivo: OBJETIVO_GRUPO(linhas.length),
      automatico: false,
    });
    return { ok: true, existente: false, proposta: resultado.proposta, total: linhas.length, empresas };
  } catch (err: any) {
    console.error('[analisar-grupo]', err?.message);
    return vazio(`A análise falhou: ${err?.message ?? 'erro desconhecido'}`, linhas.length, empresas);
  }
}
