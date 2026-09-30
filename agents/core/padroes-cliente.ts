// Padrões salvos por cliente (base) para os ajustes determinísticos do Painel de Erros — pra não perguntar
// de novo toda vez qual candidato usar (tipo de movimento de entrada, forma de pagamento, etc.). Tabela
// ÚNICA e genérica (chave + valor em JSONB): um ajuste novo só precisa de uma chave nova aqui, nunca de uma
// migration nova. Sempre por (empresa_id, cliente_id) — os candidatos vêm do catálogo do EMSys3 de CADA
// cliente, o mesmo `id` não tem relação nenhuma entre clientes diferentes.
import { query, queryOne } from '@/lib/db';

/** Chaves conhecidas — cada ajuste determinístico que tiver um "sempre pergunta" usa a sua aqui. */
export const CHAVE_TIPO_MOVIMENTO_ESTOQUE = 'tipo_movimento_entrada_estoque';
export const CHAVE_FORMA_PAGAMENTO_AJUSTE = 'forma_pagamento_ajuste';

/** Rótulo pra tela de configuração por cliente — toda chave nova precisa de uma linha aqui pra aparecer lá. */
export const LABEL_PADRAO_CLIENTE: Record<string, { titulo: string; descricaoDoValor: (v: any) => string }> = {
  [CHAVE_TIPO_MOVIMENTO_ESTOQUE]: {
    titulo: 'Tipo de movimento de entrada (Ajustar estoque)',
    descricaoDoValor: (v) => v?.descricao ?? '',
  },
  [CHAVE_FORMA_PAGAMENTO_AJUSTE]: {
    titulo: 'Forma de pagamento (Ajustar forma de pagamento)',
    descricaoDoValor: (v) => v?.descricao ?? '',
  },
};

export async function obterPadraoCliente<T = unknown>(empresa_id: string, cliente_id: string, chave: string): Promise<T | null> {
  const row = await queryOne<{ valor: T }>(
    `SELECT valor FROM agente_cliente_padrao WHERE empresa_id = $1 AND cliente_id = $2 AND chave = $3`,
    [empresa_id, cliente_id, chave],
  ).catch((e: any) => {
    console.error('[padroes-cliente] falha ao ler (a migration add_agente_cliente_padrao.sql já rodou?):', e?.message);
    return null;
  });
  return row ? row.valor : null;
}

/** Todos os padrões salvos desta base, por chave — usado pela tela de configuração por cliente. */
export async function listarPadroesCliente(empresa_id: string, cliente_id: string): Promise<Record<string, unknown>> {
  const linhas = await query<{ chave: string; valor: unknown }>(
    `SELECT chave, valor FROM agente_cliente_padrao WHERE empresa_id = $1 AND cliente_id = $2`,
    [empresa_id, cliente_id],
  ).catch((e: any) => {
    console.error('[padroes-cliente] falha ao listar:', e?.message);
    return [] as any[];
  });
  const m: Record<string, unknown> = {};
  for (const l of linhas) m[l.chave] = l.valor;
  return m;
}

export async function definirPadraoCliente(empresa_id: string, cliente_id: string, chave: string, valor: unknown): Promise<void> {
  await query(
    `INSERT INTO agente_cliente_padrao (empresa_id, cliente_id, chave, valor)
     VALUES ($1, $2, $3, $4::jsonb)
     ON CONFLICT (empresa_id, cliente_id, chave) DO UPDATE SET
       valor = EXCLUDED.valor, atualizado_em = NOW()`,
    [empresa_id, cliente_id, chave, JSON.stringify(valor)],
  );
}

export async function limparPadraoCliente(empresa_id: string, cliente_id: string, chave: string): Promise<void> {
  await query(`DELETE FROM agente_cliente_padrao WHERE empresa_id = $1 AND cliente_id = $2 AND chave = $3`, [empresa_id, cliente_id, chave]);
}
