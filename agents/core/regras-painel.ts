// Regras de ação por tipo de erro do Painel de Erros: o que fazer com cada CATEGORIA (classificada em
// classificar.ts a partir do texto do erro) é dado, gravado em agente_regras_painel, não código — o
// operador ajusta pela tela de Configuração sem precisar de deploy. Categoria sem linha na tabela usa o
// padrão embutido abaixo (DEFAULTS), então o app nunca fica sem regra.
import { query, queryOne } from '@/lib/db';
import { CATEGORIA_SALDO_ADIANTAMENTO, CATEGORIA_SALDO_PRODUTO_LOJA } from './classificar';

export type ModoRegraPainel =
  | 'somente_reprocessar'   // nunca ajustado por aqui: só marca reprocessar=true no painel
  | 'ajustar_pagamento'     // troca a forma de pagamento (tipo AC) no JSON da venda e reprocessa
  | 'ajustar_estoque'       // lança entrada de estoque (déficit real) em tab_movimento_estoque e reprocessa
  | 'elegivel_automatico'   // analisado por IA; depois de aprovado 1x pode ser marcado para rodar sozinho
  | 'assistido'             // analisado por IA, sempre aguardando aprovação
  | 'manual';               // sem regra própria: analisado por IA, tratado caso a caso

export interface RegraPainel {
  categoria: string;
  modo: ModoRegraPainel;
  titulo: string;
  descricao: string;
  /** false = regra ainda não personalizada pelo operador; está usando o padrão embutido */
  personalizada: boolean;
}

/** Categorias que NÃO passam pela análise de IA — já têm uma ação definida e determinística. */
export const MODOS_SEM_ANALISE_IA: ModoRegraPainel[] = ['somente_reprocessar', 'ajustar_pagamento', 'ajustar_estoque'];

const REGRA_PADRAO: Omit<RegraPainel, 'categoria' | 'personalizada'> = {
  modo: 'manual',
  titulo: 'Manual',
  descricao: 'Tipo ainda sem regra definida; exige análise.',
};

// Padrões embutidos para as categorias que o app já conhece (classificar.ts). Servem de ponto de partida —
// o operador pode mudar cada um pela tela; a tabela sempre vence quando tem linha ativa para a categoria.
const DEFAULTS: Record<string, Omit<RegraPainel, 'categoria' | 'personalizada'>> = {
  'Saldo insuficiente · Combustível': {
    modo: 'somente_reprocessar',
    titulo: 'Somente reprocessar',
    descricao: 'Combustível nunca é ajustado pelo painel. Corrija o estoque no EMSys3 (entrada ou medição do tanque) e use "Conferir saldo real do tanque" para saber se já é suficiente antes de reprocessar — a conferência só lê, não lança nada. Se reprocessar sem o saldo estar certo, o erro reaparece.',
  },
  [CATEGORIA_SALDO_PRODUTO_LOJA]: {
    modo: 'ajustar_estoque',
    titulo: 'Ajustar estoque',
    descricao: 'O saldo real do item está abaixo do necessário. Lança uma entrada de estoque (por inventário) cobrindo o déficit confirmado e reprocessa — sem passar por análise de IA.',
  },
  [CATEGORIA_SALDO_ADIANTAMENTO]: {
    modo: 'ajustar_pagamento',
    titulo: 'Ajustar forma de pagamento',
    descricao: 'O cliente não tem saldo de adiantamento suficiente e a nota fiscal já foi emitida. Troque a forma de pagamento da venda (só no registro interno/caixa — a nota fiscal não muda) e reprocesse.',
  },
  'Venda não encontrada · Atualiza NF': {
    modo: 'assistido',
    titulo: 'Assistido',
    descricao: 'Confirmar se a venda existe no EMSys3. Se não existe, reprocessar a pendência no painel.',
  },
  'Venda não encontrada · Cancelamento': {
    modo: 'assistido',
    titulo: 'Assistido',
    descricao: 'Confirmar se a venda existe no EMSys3. Se não existe, o cancelamento pode ser reprocessado no painel.',
  },
};

function normalizar(categoria: string, r: Omit<RegraPainel, 'categoria' | 'personalizada'> | undefined, personalizada: boolean): RegraPainel {
  const base = r ?? DEFAULTS[categoria] ?? REGRA_PADRAO;
  return { categoria, personalizada, ...base };
}

/** Regra efetiva de uma categoria (linha ativa da empresa > padrão embutido > "manual" genérico). */
export function resolverRegra(regras: Map<string, RegraPainel>, categoria: string): RegraPainel {
  return regras.get(categoria) ?? normalizar(categoria, DEFAULTS[categoria], false);
}

/** Todas as regras personalizadas (ativas) da empresa, prontas para resolverRegra(). */
export async function obterRegrasPainel(empresa_id: string): Promise<Map<string, RegraPainel>> {
  const linhas = await query<{ categoria: string; modo: ModoRegraPainel; titulo: string; descricao: string }>(
    `SELECT categoria, modo, titulo, descricao FROM agente_regras_painel WHERE empresa_id = $1 AND ativo = TRUE`,
    [empresa_id],
  ).catch((e: any) => {
    console.error('[regras-painel] falha ao carregar (a migration add_agente_regras_painel.sql já rodou?):', e?.message);
    return [] as any[];
  });
  const m = new Map<string, RegraPainel>();
  for (const l of linhas) m.set(l.categoria, normalizar(l.categoria, l, true));
  return m;
}

/**
 * Lista para a tela de Configuração: união das categorias conhecidas (padrões embutidos) com as que o
 * operador já personalizou, mesmo que a categoria não apareça mais no painel agora.
 */
export async function listarRegrasPainelCompleto(empresa_id: string): Promise<RegraPainel[]> {
  const personalizadas = await obterRegrasPainel(empresa_id);
  const categorias = new Set([...Object.keys(DEFAULTS), ...personalizadas.keys()]);
  return [...categorias].sort().map((c) => resolverRegra(personalizadas, c));
}

/** Grava (ou atualiza) a regra de uma categoria para a empresa. */
export async function upsertRegraPainel(
  empresa_id: string,
  categoria: string,
  dados: { modo: ModoRegraPainel; titulo: string; descricao: string },
): Promise<void> {
  await query(
    `INSERT INTO agente_regras_painel (empresa_id, categoria, modo, titulo, descricao, ativo)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     ON CONFLICT (empresa_id, categoria) DO UPDATE SET
       modo = EXCLUDED.modo, titulo = EXCLUDED.titulo, descricao = EXCLUDED.descricao,
       ativo = TRUE, atualizado_em = NOW()`,
    [empresa_id, categoria, dados.modo, dados.titulo, dados.descricao],
  );
}

/** Volta a categoria para o padrão embutido (remove a personalização). */
export async function resetarRegraPainel(empresa_id: string, categoria: string): Promise<void> {
  await query(`DELETE FROM agente_regras_painel WHERE empresa_id = $1 AND categoria = $2`, [empresa_id, categoria]);
}
