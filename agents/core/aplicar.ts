// Aplica o SQL de uma proposta no banco do cliente. Ponto único usado pela rota /aplicar (operador
// clicando) e pela autonomia (agente aplicando sozinho) — as travas de segurança são as mesmas nos
// dois caminhos, e o agente ainda tem travas extras (só INSERT/UPDATE, risco baixo/médio, efeito real).
import pg from 'pg';
import pool from '@/lib/db';
import { obterCliente, listarBases } from './db';
import { salvarAprendizado } from './aprendizado';
import { marcarReprocessarPainel } from './painel';
import { descriptografar } from './crypto';
import { garantirVinculo } from './vinculo';
import type { AgenteProposta } from './types';

const DDL_PROIBIDO        = /^\s*(DROP|ALTER|CREATE|TRUNCATE|RENAME|COMMENT)\s/i;
const UPDATE_SEM_WHERE    = /^\s*UPDATE\b(?![\s\S]*\bWHERE\b)/i;
const DELETE_SEM_WHERE    = /^\s*DELETE\b(?![\s\S]*\bWHERE\b)/i;
const SO_INSERT_OU_UPDATE = /^\s*(INSERT|UPDATE)\b/i;
export const MAX_LINHAS_AFETADAS = 20;

export type AtorAplicacao = { tipo: 'usuario'; id: string } | { tipo: 'agente' };

export type ResultadoAplicacao =
  | { ok: true; proposta: AgenteProposta; resultados: Array<{ stmt: string; rowCount: number }> }
  | { ok: false; status: number; erro: string };

/** Remove comentários SQL (de linha e de bloco) antes das verificações de segurança. */
function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')  // bloco /* */
    .replace(/--.*/g, ' ')              // linha --
    .trim();
}

export function dividirStatements(sql: string): string[] {
  return sql.split(';').map((s) => s.trim()).filter(Boolean);
}

/** true se TODOS os statements são INSERT ou UPDATE simples (sem DELETE, DDL, CTE etc.). */
export function somenteInsertOuUpdate(sql: string): boolean {
  const statements = dividirStatements(sql);
  return statements.length > 0 && statements.every((s) => SO_INSERT_OU_UPDATE.test(stripSqlComments(s)));
}

export async function aplicarProposta(
  empresa_id: string,
  proposta_id: string,
  ator: AtorAplicacao,
): Promise<ResultadoAplicacao> {
  const agente = ator.tipo === 'agente';
  const falha = (status: number, erro: string): ResultadoAplicacao => ({ ok: false, status, erro });

  // Trava de sessão no banco do app: dois cliques / duas varreduras simultâneas não aplicam o mesmo SQL
  // duas vezes. Cliente direto do pool (sem o retry automático de lib/db, que poderia reexecutar o SQL).
  const lock = await pool.connect();
  const chaveLock = `aplicar:${proposta_id}`;
  let liberarComErro = false;

  try {
    const { rows: [trava] } = await lock.query(`SELECT pg_try_advisory_lock(hashtext($1)) AS ok`, [chaveLock]);
    if (!trava?.ok) return falha(409, 'Esta proposta já está sendo aplicada.');

    const proposta = (await lock.query(
      `SELECT * FROM agente_propostas WHERE id = $1 AND empresa_id = $2`,
      [proposta_id, empresa_id],
    )).rows[0] as AgenteProposta | undefined;
    if (!proposta) return falha(404, 'Proposta não encontrada');
    // 'aprovada' entra porque a auto-aprovação só muda o status — sem isso ela nunca chegava a ser aplicada
    if (proposta.status !== 'aguardando' && proposta.status !== 'aprovada') {
      return falha(400, `Proposta já está com status "${proposta.status}"`);
    }
    if (!proposta.sql_correcao?.trim()) {
      return falha(400, 'Esta proposta não tem SQL de correção para executar');
    }
    if (!proposta.cliente_id) {
      return falha(400, 'Proposta sem cliente vinculado — não é possível aplicar automaticamente');
    }

    // Valida cada statement: DDL, WHERE ausente em UPDATE/DELETE
    const statements = dividirStatements(proposta.sql_correcao);
    for (const stmt of statements) {
      const limpo = stripSqlComments(stmt);
      if (DDL_PROIBIDO.test(limpo)) {
        return falha(400, `SQL contém comando DDL proibido (${limpo.split(/\s/)[0].toUpperCase()}). Apenas DML (UPDATE/INSERT/DELETE) é permitido.`);
      }
      if (UPDATE_SEM_WHERE.test(limpo)) {
        return falha(400, 'UPDATE sem cláusula WHERE detectado — operação recusada para evitar atualização em massa.');
      }
      if (DELETE_SEM_WHERE.test(limpo)) {
        return falha(400, 'DELETE sem cláusula WHERE detectado — operação recusada para evitar exclusão em massa.');
      }
    }

    // Travas extras só para o agente: ele nunca apaga dado nem mexe em correção de risco alto
    if (agente) {
      if (proposta.nivel_risco !== 'baixo' && proposta.nivel_risco !== 'medio') {
        return falha(403, `Aplicação automática recusada: risco "${proposta.nivel_risco}" exige operador.`);
      }
      if (!somenteInsertOuUpdate(proposta.sql_correcao)) {
        return falha(403, 'Aplicação automática recusada: só INSERT/UPDATE simples são permitidos sem operador.');
      }
    }

    const cliente = await obterCliente(proposta.cliente_id, empresa_id);
    if (!cliente) return falha(404, 'Cliente não encontrado');

    // Trava de segurança: só escreve se AS e EMSys3 do cliente forem comprovadamente da mesma empresa (CNPJ)
    const vinculo = await garantirVinculo(proposta.cliente_id, empresa_id);
    if (!vinculo.ok) {
      return falha(409, `Aplicação bloqueada — vínculo AS x EMSys3 não validado: ${vinculo.erro}`);
    }

    // Resolve em qual base conectar: "principal" (banco do cliente) ou uma das bases
    // adicionais (ex: "dunapetrol_emsys") — a tabela alvo do SQL pode não estar na principal.
    const baseAlvo = proposta.base_alvo?.trim() || 'principal';
    let dbConfig = { host: cliente.db_host, porta: cliente.db_porta, nome: cliente.db_nome, usuario: cliente.db_usuario, senha: descriptografar(cliente.db_senha) };

    if (baseAlvo.toLowerCase() !== 'principal') {
      const bases = await listarBases(cliente.id, empresa_id).catch(() => []);
      const baseEncontrada = bases.find(
        (b) =>
          b.ativo &&
          (b.nome.toLowerCase() === baseAlvo.toLowerCase() ||
            b.nome.toLowerCase().includes(baseAlvo.toLowerCase()) ||
            baseAlvo.toLowerCase().includes(b.nome.toLowerCase())),
      );
      if (!baseEncontrada) {
        return falha(400, `Base "${baseAlvo}" (definida na proposta) não encontrada ou inativa nas bases configuradas do cliente.`);
      }
      dbConfig = { host: baseEncontrada.db_host, porta: baseEncontrada.db_porta, nome: baseEncontrada.db_nome, usuario: baseEncontrada.db_usuario, senha: descriptografar(baseEncontrada.db_senha) };
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

    const registrarFalha = async (msg: string) => {
      await lock.query(
        `UPDATE agente_propostas
            SET status = 'falhou', aplicacao_erro = $1, atualizado_em = NOW()
          WHERE id = $2 AND empresa_id = $3`,
        [msg.slice(0, 500), proposta_id, empresa_id],
      );
    };

    let resultados: Array<{ stmt: string; rowCount: number }>;
    try {
      await pgClient.connect();
      await pgClient.query('BEGIN');

      resultados = [];
      let total = 0;
      for (const stmt of statements) {
        const res = await pgClient.query(stmt);
        const rowCount = res.rowCount ?? 0;

        // Aborta se um único statement afetar mais linhas do que o permitido
        if (rowCount > MAX_LINHAS_AFETADAS) {
          await pgClient.query('ROLLBACK');
          return falha(400, `Statement afetaria ${rowCount} linhas (máximo ${MAX_LINHAS_AFETADAS}). Operação abortada por segurança.`);
        }
        total += rowCount;
        resultados.push({ stmt: stmt.slice(0, 120), rowCount });
      }

      // O agente não dá a correção por feita se o SQL não mexeu em nada — o operador poderia notar, ele não
      if (agente && total === 0) {
        await pgClient.query('ROLLBACK');
        const msg = 'SQL aplicado pelo agente não afetou nenhuma linha — desfeito.';
        await registrarFalha(msg);
        return falha(422, msg);
      }

      await pgClient.query('COMMIT');
    } catch (err: any) {
      await pgClient.query('ROLLBACK').catch(() => {});
      const msg = err?.message ?? 'Erro ao executar SQL';
      await registrarFalha(msg);
      return falha(500, msg);
    } finally {
      await pgClient.end().catch(() => {});
    }

    const atualizada = (await lock.query(
      `UPDATE agente_propostas
          SET status = 'aplicada', aprovado_por = $1, aplicado_em = NOW(), aplicacao_erro = NULL,
              aplicado_por_agente = $2, confirmado_em = NULL, atualizado_em = NOW()
        WHERE id = $3 AND empresa_id = $4
        RETURNING *, NULL::text AS aprovado_por_nome`,
      [agente ? null : ator.id, agente, proposta_id, empresa_id],
    )).rows[0] as AgenteProposta;

    // SQL rodou com sucesso de verdade — este é o melhor momento pra aprender
    // (mais confiável que aprovar sem executar, já que confirma que a correção funciona).
    // Também libera o painel AS pra reprocessar a pendência, senão a próxima varredura acha o
    // mesmo "codigo" de novo e trata como recaída.
    await Promise.all([
      salvarAprendizado(empresa_id, atualizada).catch((e) => console.error('[aplicar] aprendizado:', e?.message)),
      marcarReprocessarPainel(empresa_id, atualizada).catch((e) => console.error('[aplicar] painel:', e?.message)),
    ]);

    return { ok: true, proposta: atualizada, resultados };
  } finally {
    await lock.query(`SELECT pg_advisory_unlock(hashtext($1))`, [chaveLock]).catch(() => { liberarComErro = true; });
    // Se não deu pra soltar a trava, destrói a conexão em vez de devolvê-la ao pool segurando o lock
    lock.release(liberarComErro);
  }
}
