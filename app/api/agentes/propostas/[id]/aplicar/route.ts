import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { obterCliente, listarBases } from '@/agents/core/db';
import { salvarAprendizado } from '@/agents/core/aprendizado';
import { marcarReprocessarPainel } from '@/agents/core/painel';
import type { AgenteProposta } from '@/agents/core/types';
import pg from 'pg';

const DDL_PROIBIDO       = /^\s*(DROP|ALTER|CREATE|TRUNCATE|RENAME|COMMENT)\s/i;
const UPDATE_SEM_WHERE   = /^\s*UPDATE\b(?![\s\S]*\bWHERE\b)/i;
const DELETE_SEM_WHERE   = /^\s*DELETE\b(?![\s\S]*\bWHERE\b)/i;
const MAX_LINHAS_AFETADAS = 20;

/** Remove comentários SQL (-- ... e /* ... *‌/) antes das verificações de segurança. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // bloco /* */
    .replace(/--.*/g, ' ')              // linha --
    .trim();
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { id } = await params;

  // Carrega a proposta
  const proposta = await queryOne<AgenteProposta>(
    `SELECT * FROM agente_propostas WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );

  if (!proposta) return NextResponse.json({ error: 'Proposta não encontrada' }, { status: 404 });
  if (proposta.status !== 'aguardando') {
    return NextResponse.json({ error: `Proposta já está com status "${proposta.status}"` }, { status: 400 });
  }
  if (!proposta.sql_correcao?.trim()) {
    return NextResponse.json({ error: 'Esta proposta não tem SQL de correção para executar' }, { status: 400 });
  }
  if (!proposta.cliente_id) {
    return NextResponse.json({ error: 'Proposta sem cliente vinculado — não é possível aplicar automaticamente' }, { status: 400 });
  }

  // Valida cada statement: DDL, WHERE ausente em UPDATE/DELETE
  const statements = proposta.sql_correcao.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) {
    const limpo = stripSqlComments(stmt);
    if (DDL_PROIBIDO.test(limpo)) {
      return NextResponse.json({
        error: `SQL contém comando DDL proibido (${limpo.split(/\s/)[0].toUpperCase()}). Apenas DML (UPDATE/INSERT/DELETE) é permitido.`,
      }, { status: 400 });
    }
    if (UPDATE_SEM_WHERE.test(limpo)) {
      return NextResponse.json({
        error: 'UPDATE sem cláusula WHERE detectado — operação recusada para evitar atualização em massa.',
      }, { status: 400 });
    }
    if (DELETE_SEM_WHERE.test(limpo)) {
      return NextResponse.json({
        error: 'DELETE sem cláusula WHERE detectado — operação recusada para evitar exclusão em massa.',
      }, { status: 400 });
    }
  }

  // Busca credenciais do cliente
  const cliente = await obterCliente(proposta.cliente_id, session.empresaId);
  if (!cliente) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });

  // Resolve em qual base conectar: "principal" (banco do cliente) ou uma das bases
  // adicionais (ex: "dunapetrol_emsys") — a tabela alvo do SQL pode não estar na principal.
  const baseAlvo = proposta.base_alvo?.trim() || 'principal';
  let dbConfig = { host: cliente.db_host, porta: cliente.db_porta, nome: cliente.db_nome, usuario: cliente.db_usuario, senha: cliente.db_senha };

  if (baseAlvo.toLowerCase() !== 'principal') {
    const bases = await listarBases(cliente.id, session.empresaId).catch(() => []);
    const baseEncontrada = bases.find(
      (b) =>
        b.ativo &&
        (b.nome.toLowerCase() === baseAlvo.toLowerCase() ||
          b.nome.toLowerCase().includes(baseAlvo.toLowerCase()) ||
          baseAlvo.toLowerCase().includes(b.nome.toLowerCase())),
    );
    if (!baseEncontrada) {
      return NextResponse.json({
        error: `Base "${baseAlvo}" (definida na proposta) não encontrada ou inativa nas bases configuradas do cliente.`,
      }, { status: 400 });
    }
    dbConfig = { host: baseEncontrada.db_host, porta: baseEncontrada.db_porta, nome: baseEncontrada.db_nome, usuario: baseEncontrada.db_usuario, senha: baseEncontrada.db_senha };
  }

  const pgClient = new pg.Client({
    host:     dbConfig.host,
    port:     dbConfig.porta,
    database: dbConfig.nome,
    user:     dbConfig.usuario,
    password: dbConfig.senha,
    connectionTimeoutMillis: 10000,
    ssl: false,
  });

  try {
    await pgClient.connect();
    await pgClient.query('BEGIN');

    const resultados: Array<{ stmt: string; rowCount: number }> = [];
    for (const stmt of statements) {
      const res = await pgClient.query(stmt);
      const rowCount = res.rowCount ?? 0;

      // Aborta se um único statement afetar mais linhas do que o permitido
      if (rowCount > MAX_LINHAS_AFETADAS) {
        await pgClient.query('ROLLBACK');
        return NextResponse.json({
          error: `Statement afetaria ${rowCount} linhas (máximo ${MAX_LINHAS_AFETADAS}). Operação abortada por segurança.`,
        }, { status: 400 });
      }

      resultados.push({ stmt: stmt.slice(0, 120), rowCount });
    }

    await pgClient.query('COMMIT');

    // Marca como aplicada
    const atualizada = await query<AgenteProposta>(
      `UPDATE agente_propostas
       SET status = 'aplicada', aprovado_por = $1, aplicado_em = NOW(), aplicacao_erro = NULL, atualizado_em = NOW()
       WHERE id = $2 AND empresa_id = $3
       RETURNING *, NULL::text AS aprovado_por_nome`,
      [session.sub, id, session.empresaId],
    );

    // SQL rodou com sucesso de verdade — este é o melhor momento pra aprender
    // (mais confiável que aprovar sem executar, já que confirma que a correção funciona).
    salvarAprendizado(session.empresaId, atualizada[0]).catch(() => {});
    // SQL rodou — libera o painel AS pra reprocessar essa pendência específica,
    // senão a próxima varredura acha o mesmo "codigo" de novo e trata como recaída.
    marcarReprocessarPainel(session.empresaId, atualizada[0]).catch(() => {});

    return NextResponse.json({
      proposta: atualizada[0],
      resultados,
      mensagem: `SQL aplicado com sucesso. ${resultados.map((r) => `${r.rowCount} linha(s) afetada(s)`).join(', ')}.`,
    });
  } catch (err: any) {
    await pgClient.query('ROLLBACK').catch(() => {});
    const msg = err?.message ?? 'Erro ao executar SQL';

    // Marca como falhou
    await query(
      `UPDATE agente_propostas
       SET status = 'falhou', aplicacao_erro = $1, atualizado_em = NOW()
       WHERE id = $2 AND empresa_id = $3`,
      [msg.slice(0, 500), id, session.empresaId],
    );

    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    await pgClient.end().catch(() => {});
  }
}
