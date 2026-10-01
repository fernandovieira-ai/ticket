import { query } from './db-unified';

export interface SmartposCliente {
  id: number;
  cnpj: string;
  nome_cliente: string;
  ind_ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export function normalizarCnpj(v: unknown): string | null {
  const d = String(v ?? '').replace(/\D/g, '');
  return d.length === 14 ? d : null;
}

export async function listarSmartpos(): Promise<SmartposCliente[]> {
  const result = await query(
    `SELECT id, cnpj, nome_cliente, ind_ativo, criado_em, atualizado_em
       FROM drf_smartpos_clientes
      ORDER BY nome_cliente`
  );
  return result.rows;
}

export async function criarSmartpos(
  cnpj: string,
  nomeCliente: string,
  indAtivo: boolean
): Promise<SmartposCliente> {
  const result = await query(
    `INSERT INTO drf_smartpos_clientes (cnpj, nome_cliente, ind_ativo)
     VALUES ($1, $2, $3)
     RETURNING id, cnpj, nome_cliente, ind_ativo, criado_em, atualizado_em`,
    [cnpj, nomeCliente, indAtivo]
  );
  return result.rows[0];
}

export async function atualizarSmartpos(
  id: number,
  cnpj: string,
  nomeCliente: string,
  indAtivo: boolean
): Promise<SmartposCliente | null> {
  const result = await query(
    `UPDATE drf_smartpos_clientes
        SET cnpj = $1, nome_cliente = $2, ind_ativo = $3, atualizado_em = NOW()
      WHERE id = $4
      RETURNING id, cnpj, nome_cliente, ind_ativo, criado_em, atualizado_em`,
    [cnpj, nomeCliente, indAtivo, id]
  );
  return result.rows[0] ?? null;
}

export async function removerSmartpos(id: number): Promise<boolean> {
  const result = await query(`DELETE FROM drf_smartpos_clientes WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}
