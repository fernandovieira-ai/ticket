import type { PoolClient } from 'pg';
import { query, queryOne, transaction } from '@/lib/db';
import { criptografar } from './crypto';
import { assinaturaErro } from './assinatura';
import type {
  AgenteProposta,
  AgenteConfig,
  AgenteCliente,
  AgenteClienteBase,
  AgenteRegra,
  AgenteConhecimento,
  AgenteAutonomia,
  AnalisarErroOutput,
  TipoCorrecao,
  NivelRisco,
} from './types';

// Substitui caracteres fora do range LATIN1 por '?' antes de salvar no banco primário (LATIN1)
function latin1Safe(s: string | null | undefined): string {
  if (!s) return '';
  return s.normalize('NFC').replace(/[^\x00-\xFF]/g, '?');
}

// ----------------------------------------------------------------
// Propostas
// ----------------------------------------------------------------

export async function criarProposta(
  empresa_id: string,
  descricao_erro: string,
  analise: AnalisarErroOutput,
  cliente?: { id: string; nome: string } | null,
  erro_hash?: string | null,
  codigo_painel?: string | null,
): Promise<AgenteProposta> {
  const rows = await query<AgenteProposta>(
    `INSERT INTO agente_propostas
       (empresa_id, titulo, descricao_erro, analise, correcao_proposta, sql_correcao, base_alvo, tipo, nivel_risco, cliente_id, cliente_nome, erro_hash, painel_codigo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *, NULL::text AS aprovado_por_nome, NULL::text AS aplicacao_erro`,
    [
      empresa_id,
      latin1Safe(analise.titulo),
      latin1Safe(descricao_erro),
      latin1Safe(analise.analise),
      latin1Safe(analise.correcao_proposta),
      analise.sql_correcao ? latin1Safe(analise.sql_correcao) : null,
      analise.base_alvo?.trim() || 'principal',
      sanitizarTipo(analise.tipo),
      sanitizarNivel(analise.nivel_risco),
      cliente?.id ?? null,
      cliente?.nome ?? null,
      erro_hash ?? null,
      codigo_painel ?? null,
    ],
  );
  return rows[0];
}

/** Retorna a proposta mais recente com esse hash (últimos 7 dias), ou null se não existe. */
export async function verificarAnalise(
  empresa_id: string,
  hash: string,
): Promise<{ id: string; status: import('./types').PropostaStatus; confirmado_em: string | null } | null> {
  return queryOne<{ id: string; status: import('./types').PropostaStatus; confirmado_em: string | null }>(
    `SELECT id, status, confirmado_em FROM agente_propostas
     WHERE empresa_id = $1 AND erro_hash = $2
       AND criado_em > NOW() - INTERVAL '7 days'
     ORDER BY criado_em DESC LIMIT 1`,
    [empresa_id, hash],
  );
}

/** Atualiza atualizado_em para registrar que o erro ainda está ativo no painel. */
export async function confirmarAtivo(id: string, empresa_id: string): Promise<void> {
  await query(
    `UPDATE agente_propostas SET atualizado_em = NOW() WHERE id = $1 AND empresa_id = $2`,
    [id, empresa_id],
  );
}

export async function marcarUltimoScan(cliente_id: string): Promise<void> {
  await query(
    `UPDATE agente_clientes SET ultimo_scan = NOW() WHERE id = $1`,
    [cliente_id],
  );
}

/** Propostas aguardando aprovação que vieram do painel builtin (têm painel_codigo) para um cliente. */
export async function listarAguardandoComCodigoPainel(
  empresa_id: string,
  cliente_id: string,
): Promise<Array<{ id: string; painel_codigo: string }>> {
  return query<{ id: string; painel_codigo: string }>(
    `SELECT id, painel_codigo FROM agente_propostas
     WHERE empresa_id = $1 AND cliente_id = $2 AND status = 'aguardando' AND painel_codigo IS NOT NULL`,
    [empresa_id, cliente_id],
  );
}

/**
 * Propostas aguardando aprovação SEM painel_codigo (criadas antes desse campo existir,
 * ou vindas de análise manual) — não dá pra verificar por código, só por hash do erro
 * contra a lista de erros atualmente ativos no painel.
 */
export async function listarAguardandoSemCodigoPainel(
  empresa_id: string,
  cliente_id: string,
): Promise<Array<{ id: string; erro_hash: string | null }>> {
  return query<{ id: string; erro_hash: string | null }>(
    `SELECT id, erro_hash FROM agente_propostas
     WHERE empresa_id = $1 AND cliente_id = $2 AND status = 'aguardando' AND painel_codigo IS NULL`,
    [empresa_id, cliente_id],
  );
}

/**
 * Marca uma proposta como obsoleta: o erro de origem não existe mais no painel
 * (foi resolvido/reprocessado por fora do sistema). Não apaga — só tira da fila
 * de aprovação, mantendo o registro pra auditoria/histórico.
 */
export async function marcarObsoleta(id: string, empresa_id: string): Promise<void> {
  await query(
    `UPDATE agente_propostas SET status = 'obsoleta', atualizado_em = NOW() WHERE id = $1 AND empresa_id = $2`,
    [id, empresa_id],
  );
}

export async function listarPropostas(empresa_id: string): Promise<AgenteProposta[]> {
  return query<AgenteProposta>(
    `SELECT p.*, u.nome AS aprovado_por_nome
     FROM agente_propostas p
     LEFT JOIN usuarios u ON u.id = p.aprovado_por
     WHERE p.empresa_id = $1
     ORDER BY p.criado_em DESC`,
    [empresa_id],
  );
}

const NIVEIS_VALIDOS: NivelRisco[] = ['baixo', 'medio', 'alto', 'critico'];

// Mapeia os valores que a IA retorna para os que o banco aceita.
// Após rodar fix_agente_propostas_tipo_check.sql, o banco aceitará os valores novos diretamente.
const MAPA_TIPO: Record<string, TipoCorrecao> = {
  // valores novos (após migration)
  configuracao:  'configuracao',
  dados:         'dados',
  codigo:        'codigo',
  infraestrutura:'infraestrutura',
  outro:         'outro',
  // valores antigos (antes da migration) → fallback seguro
  query_sql:  'dados',
  logica:     'codigo',
  permissao:  'configuracao',
};

function sanitizarTipo(v: string): TipoCorrecao {
  return MAPA_TIPO[v] ?? 'outro';
}

function sanitizarNivel(v: string): NivelRisco {
  return (NIVEIS_VALIDOS.includes(v as NivelRisco) ? v : 'medio') as NivelRisco;
}

/** Atualiza o conteúdo de uma proposta com a análise refinada, mantendo o mesmo registro. */
export async function atualizarConteudoProposta(
  id: string,
  empresa_id: string,
  analise: AnalisarErroOutput,
): Promise<AgenteProposta | null> {
  return queryOne<AgenteProposta>(
    `UPDATE agente_propostas
     SET titulo            = $1,
         analise           = $2,
         correcao_proposta = $3,
         sql_correcao      = $4,
         base_alvo         = $5,
         tipo              = $6,
         nivel_risco       = $7,
         status            = 'aguardando',
         aprovado_por      = NULL,
         aplicado_em       = NULL,
         aplicacao_erro    = NULL,
         atualizado_em     = NOW()
     WHERE id = $8 AND empresa_id = $9
     RETURNING *, NULL::text AS aprovado_por_nome`,
    [
      latin1Safe(analise.titulo),
      latin1Safe(analise.analise),
      latin1Safe(analise.correcao_proposta),
      analise.sql_correcao ? latin1Safe(analise.sql_correcao) : null,
      analise.base_alvo?.trim() || 'principal',
      sanitizarTipo(analise.tipo),
      sanitizarNivel(analise.nivel_risco),
      id,
      empresa_id,
    ],
  );
}

/**
 * Guarda o contexto da investigação na proposta: dados reais coletados e/ou a instrução do
 * operador (com o título resultante). Best-effort — se a migration ainda não rodou, só loga.
 */
export async function registrarContextoProposta(
  id: string,
  empresa_id: string,
  ctx: { dados_investigacao?: string | null; instrucao?: { instrucao: string; titulo: string } },
): Promise<void> {
  try {
    await query(
      `UPDATE agente_propostas
       SET dados_investigacao    = COALESCE($1, dados_investigacao),
           instrucoes_anteriores = CASE WHEN $2::jsonb IS NULL THEN instrucoes_anteriores
                                        ELSE instrucoes_anteriores || $2::jsonb END
       WHERE id = $3 AND empresa_id = $4`,
      [
        ctx.dados_investigacao != null ? latin1Safe(ctx.dados_investigacao) : null,
        ctx.instrucao
          ? JSON.stringify([{ instrucao: latin1Safe(ctx.instrucao.instrucao), titulo: latin1Safe(ctx.instrucao.titulo) }])
          : null,
        id,
        empresa_id,
      ],
    );
  } catch (e: any) {
    console.error('[agentes] falha ao registrar contexto da proposta:', e?.message);
  }
}

// ----------------------------------------------------------------
// Cache de schema (colunas já descobertas por cliente/base/tabela)
// ----------------------------------------------------------------

export async function carregarSchemaCache(
  cliente_id: string,
  empresa_id: string,
): Promise<Array<{ base: string; tabela: string; colunas: string }>> {
  try {
    return await query<{ base: string; tabela: string; colunas: string }>(
      `SELECT base, tabela, colunas FROM agente_schema_cache
       WHERE cliente_id = $1 AND empresa_id = $2
       ORDER BY atualizado_em DESC LIMIT 60`,
      [cliente_id, empresa_id],
    );
  } catch (e: any) {
    console.error('[agentes] falha ao carregar schema cache:', e?.message);
    return [];
  }
}

export async function salvarSchemaCache(
  cliente_id: string,
  empresa_id: string,
  base: string,
  tabela: string,
  colunas: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO agente_schema_cache (cliente_id, empresa_id, base, tabela, colunas)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (cliente_id, base, tabela)
       DO UPDATE SET colunas = EXCLUDED.colunas, atualizado_em = NOW()`,
      [cliente_id, empresa_id, latin1Safe(base), latin1Safe(tabela), latin1Safe(colunas)],
    );
  } catch (e: any) {
    console.error('[agentes] falha ao salvar schema cache:', e?.message);
  }
}

export async function atualizarStatusProposta(
  id: string,
  empresa_id: string,
  status: 'aprovada' | 'rejeitada' | 'aplicada' | 'falhou',
  usuario_id?: string,
): Promise<AgenteProposta | null> {
  return queryOne<AgenteProposta>(
    `UPDATE agente_propostas
     SET status       = $1,
         aprovado_por = $2,
         aplicado_em  = CASE WHEN $5::text = 'aplicada' THEN NOW() ELSE aplicado_em END,
         atualizado_em = NOW()
     WHERE id = $3 AND empresa_id = $4
     RETURNING *, NULL::text AS aprovado_por_nome`,
    [status, usuario_id ?? null, id, empresa_id, status],
  );
}

// ----------------------------------------------------------------
// Config
// ----------------------------------------------------------------

export async function obterConfig(empresa_id: string): Promise<AgenteConfig | null> {
  return queryOne<AgenteConfig>(
    `SELECT * FROM agente_config WHERE empresa_id = $1`,
    [empresa_id],
  );
}

export async function obterConfigPorToken(token: string): Promise<AgenteConfig | null> {
  return queryOne<AgenteConfig>(
    `SELECT * FROM agente_config WHERE webhook_token = $1`,
    [token],
  );
}

export async function upsertConfig(
  empresa_id: string,
  dados: {
    ativo?: boolean;
    auto_aprovar_tipos?: TipoCorrecao[];
    notificar_email?: boolean;
    notificar_whatsapp?: boolean;
    autonomia_ativa?: boolean;
    autonomia_min_sucessos?: number;
    autonomia_limite_diario?: number;
  },
): Promise<AgenteConfig> {
  // Campos de autonomia omitidos preservam o valor atual (o padrão de uma config nova é DESLIGADO)
  const rows = await query<AgenteConfig>(
    `INSERT INTO agente_config
       (empresa_id, ativo, auto_aprovar_tipos, notificar_email, notificar_whatsapp,
        autonomia_ativa, autonomia_min_sucessos, autonomia_limite_diario)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, FALSE), COALESCE($7, 2), COALESCE($8, 10))
     ON CONFLICT (empresa_id) DO UPDATE SET
       ativo                   = EXCLUDED.ativo,
       auto_aprovar_tipos      = EXCLUDED.auto_aprovar_tipos,
       notificar_email         = EXCLUDED.notificar_email,
       notificar_whatsapp      = EXCLUDED.notificar_whatsapp,
       autonomia_ativa         = COALESCE($6, agente_config.autonomia_ativa),
       autonomia_min_sucessos  = COALESCE($7, agente_config.autonomia_min_sucessos),
       autonomia_limite_diario = COALESCE($8, agente_config.autonomia_limite_diario),
       atualizado_em           = NOW()
     RETURNING *`,
    [
      empresa_id,
      dados.ativo ?? true,
      dados.auto_aprovar_tipos ?? [],
      dados.notificar_email ?? false,
      dados.notificar_whatsapp ?? false,
      dados.autonomia_ativa ?? null,
      dados.autonomia_min_sucessos ?? null,
      dados.autonomia_limite_diario ?? null,
    ],
  );
  return rows[0];
}

// ----------------------------------------------------------------
// Clientes
// ----------------------------------------------------------------

export async function listarClientes(empresa_id: string): Promise<AgenteCliente[]> {
  return query<AgenteCliente>(
    `SELECT * FROM agente_clientes WHERE empresa_id = $1 ORDER BY nome ASC`,
    [empresa_id],
  );
}

export async function obterCliente(id: string, empresa_id: string): Promise<AgenteCliente | null> {
  return queryOne<AgenteCliente>(
    `SELECT * FROM agente_clientes WHERE id = $1 AND empresa_id = $2`,
    [id, empresa_id],
  );
}

/**
 * Cria o cliente (base AS) e a base EMSys3 na MESMA transação: ou grava as duas, ou nenhuma.
 * O vínculo já deve ter sido validado (validarVinculo) antes de chamar.
 */
export async function criarClienteComBase(
  empresa_id: string,
  dados: Omit<AgenteCliente, 'id' | 'empresa_id' | 'ultimo_scan' | 'criado_em' | 'atualizado_em' | 'vinculo_validado_em' | 'vinculo_cnpjs' | 'vinculo_erro'>,
  base: { nome: string; descricao: string | null; db_host: string; db_porta: number; db_nome: string; db_usuario: string; db_senha: string; db_schema: string },
  raizes: string[],
): Promise<{ cliente: AgenteCliente; base: AgenteClienteBase }> {
  return transaction(async (client) => {
    const c = await client.query(
      `INSERT INTO agente_clientes
         (empresa_id, nome, slug, db_host, db_porta, db_nome, db_usuario, db_senha, db_schema,
          query_erros, analise_painel, notas, ativo, vinculo_validado_em, vinculo_cnpjs, vinculo_erro)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), $14, NULL)
       RETURNING *`,
      [
        empresa_id, dados.nome, dados.slug, dados.db_host, dados.db_porta,
        dados.db_nome, dados.db_usuario, criptografar(dados.db_senha),
        dados.db_schema || 'public', dados.query_erros ?? null,
        dados.analise_painel ?? false, dados.notas ?? null, dados.ativo ?? true,
        raizes.join(','),
      ],
    );
    const cliente = c.rows[0] as AgenteCliente;
    const b = await client.query(
      `INSERT INTO agente_clientes_bases
         (cliente_id, empresa_id, nome, papel, descricao, db_host, db_porta, db_nome, db_usuario, db_senha, db_schema, ativo)
       VALUES ($1, $2, $3, 'emsys', $4, $5, $6, $7, $8, $9, $10, TRUE)
       RETURNING *`,
      [
        cliente.id, empresa_id, base.nome, base.descricao,
        base.db_host, base.db_porta, base.db_nome, base.db_usuario,
        criptografar(base.db_senha), base.db_schema || 'public',
      ],
    );
    return { cliente, base: b.rows[0] as AgenteClienteBase };
  });
}

/** Grava o resultado da última validação do vínculo AS x EMSys3 (best-effort). */
export async function registrarVinculo(
  cliente_id: string,
  empresa_id: string,
  r: { ok: boolean; erro?: string | null; cnpjs?: string[] },
): Promise<void> {
  try {
    await query(
      `UPDATE agente_clientes
       SET vinculo_validado_em = CASE WHEN $1 THEN NOW() ELSE NULL END,
           vinculo_cnpjs       = CASE WHEN $1 THEN $2 ELSE NULL END,
           vinculo_erro        = $3
       WHERE id = $4 AND empresa_id = $5`,
      [r.ok, (r.cnpjs ?? []).join(',') || null, r.ok ? null : latin1Safe(r.erro ?? 'Vínculo não validado'), cliente_id, empresa_id],
    );
  } catch (e: any) {
    console.error('[agentes] falha ao registrar vínculo:', e?.message);
  }
}

/**
 * Se o banco físico (host + porta + nome) já está cadastrado em OUTRO cliente da empresa
 * (como base principal ou adicional), devolve o nome desse cliente.
 */
export async function bancoEmUsoPorOutroCliente(
  empresa_id: string,
  cfg: { db_host: string; db_porta: number; db_nome: string },
  ignorarClienteId?: string | null,
): Promise<string | null> {
  const rows = await query<{ nome: string }>(
    `SELECT c.nome FROM agente_clientes c
      WHERE c.empresa_id = $1 AND LOWER(c.db_host) = LOWER($2) AND c.db_porta = $3 AND LOWER(c.db_nome) = LOWER($4)
        AND ($5::uuid IS NULL OR c.id <> $5::uuid)
     UNION
     SELECT c.nome FROM agente_clientes_bases b JOIN agente_clientes c ON c.id = b.cliente_id
      WHERE b.empresa_id = $1 AND LOWER(b.db_host) = LOWER($2) AND b.db_porta = $3 AND LOWER(b.db_nome) = LOWER($4)
        AND ($5::uuid IS NULL OR b.cliente_id <> $5::uuid)
     LIMIT 1`,
    [empresa_id, cfg.db_host.trim(), cfg.db_porta, cfg.db_nome.trim(), ignorarClienteId ?? null],
  );
  return rows[0]?.nome ?? null;
}

export async function criarCliente(
  empresa_id: string,
  dados: Omit<AgenteCliente, 'id' | 'empresa_id' | 'ultimo_scan' | 'criado_em' | 'atualizado_em' | 'vinculo_validado_em' | 'vinculo_cnpjs' | 'vinculo_erro'>,
): Promise<AgenteCliente> {
  const rows = await query<AgenteCliente>(
    `INSERT INTO agente_clientes
       (empresa_id, nome, slug, db_host, db_porta, db_nome, db_usuario, db_senha, db_schema,
        query_erros, analise_painel, notas, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      empresa_id,
      dados.nome, dados.slug, dados.db_host, dados.db_porta,
      dados.db_nome, dados.db_usuario, criptografar(dados.db_senha),
      dados.db_schema || 'public', dados.query_erros ?? null,
      dados.analise_painel ?? false, dados.notas ?? null, dados.ativo ?? true,
    ],
  );
  return rows[0];
}

export async function atualizarCliente(
  id: string,
  empresa_id: string,
  dados: Partial<Omit<AgenteCliente, 'id' | 'empresa_id' | 'criado_em' | 'atualizado_em'>>,
  client?: PoolClient,
): Promise<AgenteCliente | null> {
  // Build SET clause only for fields that are present in dados.
  // undefined = not provided (keep existing); null = explicitly clear.
  const setClauses: string[] = ['atualizado_em = NOW()'];
  const params: unknown[] = [id, empresa_id];
  let i = 3;

  const add = (col: string, val: unknown) => {
    setClauses.push(`${col} = $${i++}`);
    params.push(val ?? null);
  };

  if (dados.nome      !== undefined) add('nome',       dados.nome);
  if (dados.slug      !== undefined) add('slug',       dados.slug);
  if (dados.db_host   !== undefined) add('db_host',    dados.db_host);
  if (dados.db_porta  !== undefined) add('db_porta',   dados.db_porta);
  if (dados.db_nome   !== undefined) add('db_nome',    dados.db_nome);
  if (dados.db_usuario !== undefined) add('db_usuario', dados.db_usuario);
  if (dados.db_senha  !== undefined) add('db_senha',   criptografar(dados.db_senha));
  if (dados.db_schema !== undefined) add('db_schema',  dados.db_schema);
  if ('query_erros' in dados)           add('query_erros',    dados.query_erros);
  if (dados.analise_painel !== undefined) add('analise_painel', dados.analise_painel);
  if (dados.notas          !== undefined) add('notas',          dados.notas);
  if (dados.ativo          !== undefined) add('ativo',          dados.ativo);

  if (setClauses.length === 1) return obterCliente(id, empresa_id); // nada a alterar

  const sql = `UPDATE agente_clientes SET ${setClauses.join(', ')} WHERE id = $1 AND empresa_id = $2 RETURNING *`;
  if (client) return ((await client.query(sql, params)).rows[0] as AgenteCliente | undefined) ?? null;
  return queryOne<AgenteCliente>(sql, params);
}

/**
 * Salva o cliente (base AS) e a base EMSys3 na MESMA transação. O vínculo já deve ter sido
 * validado antes. Se o cliente ainda não tem base EMSys3 (cadastro antigo), cria uma.
 */
export async function salvarClienteEBase(
  empresa_id: string,
  cliente_id: string,
  clienteDados: Partial<Omit<AgenteCliente, 'id' | 'empresa_id' | 'criado_em' | 'atualizado_em'>>,
  emsys: {
    baseId: string | null;
    dados: Partial<Omit<AgenteClienteBase, 'id' | 'empresa_id' | 'cliente_id' | 'criado_em' | 'atualizado_em' | 'papel'>>;
  },
): Promise<{ cliente: AgenteCliente | null; base: AgenteClienteBase | null }> {
  return transaction(async (client) => {
    const cliente = await atualizarCliente(cliente_id, empresa_id, clienteDados, client);
    const base = emsys.baseId
      ? await atualizarBase(emsys.baseId, empresa_id, emsys.dados, client)
      : await criarBase(
          empresa_id,
          {
            cliente_id, papel: 'emsys', ativo: true, descricao: null, db_schema: 'public',
            ...(emsys.dados as Omit<AgenteClienteBase, 'id' | 'empresa_id' | 'criado_em' | 'atualizado_em' | 'cliente_id' | 'papel' | 'ativo' | 'descricao' | 'db_schema'>),
          },
          client,
        );
    return { cliente, base };
  });
}

export async function deletarCliente(id: string, empresa_id: string): Promise<boolean> {
  const rows = await query(
    `DELETE FROM agente_clientes WHERE id = $1 AND empresa_id = $2 RETURNING id`,
    [id, empresa_id],
  );
  return rows.length > 0;
}

// ----------------------------------------------------------------
// Bases adicionais por cliente
// ----------------------------------------------------------------

// Só a base EMSys3 é usada pelo agente (além do AS). Bases 'outro' antigas, se existirem, são ignoradas.
export async function listarBases(cliente_id: string, empresa_id: string): Promise<AgenteClienteBase[]> {
  return query<AgenteClienteBase>(
    `SELECT * FROM agente_clientes_bases
     WHERE cliente_id = $1 AND empresa_id = $2 AND papel = 'emsys'
     ORDER BY nome ASC`,
    [cliente_id, empresa_id],
  );
}

export async function criarBase(
  empresa_id: string,
  dados: Omit<AgenteClienteBase, 'id' | 'empresa_id' | 'criado_em' | 'atualizado_em'>,
  client?: PoolClient,
): Promise<AgenteClienteBase> {
  const exec = async (sql: string, p: unknown[]): Promise<AgenteClienteBase[]> =>
    client ? ((await client.query(sql, p)).rows as AgenteClienteBase[]) : query<AgenteClienteBase>(sql, p);
  const rows = await exec(
    `INSERT INTO agente_clientes_bases
       (cliente_id, empresa_id, nome, papel, descricao, db_host, db_porta, db_nome, db_usuario, db_senha, db_schema, ativo)
     VALUES ($1, $2, $3, $12, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      dados.cliente_id, empresa_id, dados.nome, dados.descricao ?? null,
      dados.db_host, dados.db_porta, dados.db_nome,
      dados.db_usuario, criptografar(dados.db_senha), dados.db_schema || 'public',
      dados.ativo ?? true,
      dados.papel ?? 'outro',
    ],
  );
  return rows[0];
}

export async function atualizarBase(
  id: string,
  empresa_id: string,
  dados: Partial<Omit<AgenteClienteBase, 'id' | 'empresa_id' | 'cliente_id' | 'criado_em' | 'atualizado_em'>>,
  client?: PoolClient,
): Promise<AgenteClienteBase | null> {
  const setClauses: string[] = ['atualizado_em = NOW()'];
  const params: unknown[] = [id, empresa_id];
  let i = 3;

  const add = (col: string, val: unknown) => {
    setClauses.push(`${col} = $${i++}`);
    params.push(val ?? null);
  };

  if (dados.nome        !== undefined) add('nome',        dados.nome);
  if (dados.descricao   !== undefined) add('descricao',   dados.descricao);
  if (dados.db_host     !== undefined) add('db_host',     dados.db_host);
  if (dados.db_porta    !== undefined) add('db_porta',    dados.db_porta);
  if (dados.db_nome     !== undefined) add('db_nome',     dados.db_nome);
  if (dados.db_usuario  !== undefined) add('db_usuario',  dados.db_usuario);
  if (dados.db_senha    !== undefined) add('db_senha',    criptografar(dados.db_senha));
  if (dados.db_schema   !== undefined) add('db_schema',   dados.db_schema);
  if (dados.ativo       !== undefined) add('ativo',       dados.ativo);

  if (setClauses.length === 1) {
    return queryOne<AgenteClienteBase>(
      `SELECT * FROM agente_clientes_bases WHERE id = $1 AND empresa_id = $2`,
      [id, empresa_id],
    );
  }

  const sql = `UPDATE agente_clientes_bases SET ${setClauses.join(', ')} WHERE id = $1 AND empresa_id = $2 RETURNING *`;
  if (client) return ((await client.query(sql, params)).rows[0] as AgenteClienteBase | undefined) ?? null;
  return queryOne<AgenteClienteBase>(sql, params);
}

// ----------------------------------------------------------------
// Regras aprendidas pelo agente (knowledge base)
// ----------------------------------------------------------------

export async function listarRegras(empresa_id: string, cliente_id?: string): Promise<AgenteRegra[]> {
  if (cliente_id) {
    return query<AgenteRegra>(
      `SELECT * FROM agente_regras
       WHERE empresa_id = $1 AND (cliente_id = $2 OR cliente_id IS NULL) AND ativa = TRUE
       ORDER BY confianca DESC, vezes_aplicada DESC`,
      [empresa_id, cliente_id],
    );
  }
  return query<AgenteRegra>(
    `SELECT * FROM agente_regras WHERE empresa_id = $1 AND ativa = TRUE
     ORDER BY confianca DESC, vezes_aplicada DESC`,
    [empresa_id],
  );
}

export async function buscarRegraByHash(empresa_id: string, pattern_hash: string): Promise<AgenteRegra | null> {
  return queryOne<AgenteRegra>(
    `SELECT * FROM agente_regras
     WHERE empresa_id = $1 AND pattern_hash = $2 AND ativa = TRUE`,
    [empresa_id, pattern_hash],
  );
}

export async function criarOuAtualizarRegra(
  empresa_id: string,
  dados: {
    cliente_id?: string | null;
    pattern: string;
    pattern_hash: string;
    resumo: string;
    solucao: string;
    sql_correcao?: string | null;
    base_alvo?: string | null;
    tipo?: string | null;
    nivel_risco?: string | null;
    bases_consultadas: string[];
    confianca: number;
  },
): Promise<AgenteRegra> {
  const rows = await query<AgenteRegra>(
    `INSERT INTO agente_regras
       (empresa_id, cliente_id, pattern, pattern_hash, resumo, solucao, sql_correcao, base_alvo, tipo, nivel_risco, bases_consultadas, confianca, assinatura_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (empresa_id, pattern_hash) DO UPDATE SET
       assinatura_hash   = EXCLUDED.assinatura_hash,
       resumo            = EXCLUDED.resumo,
       solucao           = EXCLUDED.solucao,
       -- só sobrescreve o SQL aprendido quando o novo vier preenchido — preserva um SQL
       -- já aprovado por humano mesmo que uma reanálise automática não tenha gerado um
       sql_correcao      = COALESCE(EXCLUDED.sql_correcao, agente_regras.sql_correcao),
       base_alvo         = COALESCE(EXCLUDED.base_alvo, agente_regras.base_alvo),
       tipo              = COALESCE(EXCLUDED.tipo, agente_regras.tipo),
       nivel_risco       = COALESCE(EXCLUDED.nivel_risco, agente_regras.nivel_risco),
       bases_consultadas = EXCLUDED.bases_consultadas,
       confianca         = GREATEST(agente_regras.confianca, EXCLUDED.confianca),
       atualizado_em     = NOW()
     RETURNING *`,
    [
      empresa_id,
      dados.cliente_id ?? null,
      latin1Safe(dados.pattern),
      dados.pattern_hash,
      latin1Safe(dados.resumo),
      latin1Safe(dados.solucao),
      dados.sql_correcao ? latin1Safe(dados.sql_correcao) : null,
      dados.base_alvo ?? null,
      dados.tipo ?? null,
      dados.nivel_risco ?? null,
      dados.bases_consultadas,
      dados.confianca,
      assinaturaErro(dados.pattern).hash,
    ],
  );
  return rows[0];
}

export async function incrementarUsoRegra(empresa_id: string, pattern_hash: string): Promise<void> {
  await query(
    `UPDATE agente_regras
     SET vezes_aplicada = vezes_aplicada + 1, atualizado_em = NOW()
     WHERE empresa_id = $1 AND pattern_hash = $2`,
    [empresa_id, pattern_hash],
  );
}

/** Reduz a confiança de uma regra cujo SQL foi aplicado mas o erro voltou. */
export async function degradarRegra(empresa_id: string, pattern_hash: string): Promise<void> {
  await query(
    `UPDATE agente_regras
     SET confianca = GREATEST(0.40, confianca - 0.25), atualizado_em = NOW()
     WHERE empresa_id = $1 AND pattern_hash = $2`,
    [empresa_id, pattern_hash],
  );
}

/** Busca campos relevantes de uma proposta para compor contexto de re-análise. */
export async function obterPropostaPorId(id: string, empresa_id: string): Promise<AgenteProposta | null> {
  return queryOne<AgenteProposta>(
    `SELECT *, NULL::text AS aprovado_por_nome, NULL::text AS aplicacao_erro
       FROM agente_propostas WHERE id = $1 AND empresa_id = $2`,
    [id, empresa_id],
  );
}

export async function obterPropostaParaReanalise(id: string): Promise<{
  sql_correcao: string | null;
  correcao_proposta: string;
  analise: string;
  status: import('./types').PropostaStatus;
} | null> {
  return queryOne(
    `SELECT sql_correcao, correcao_proposta, analise, status
     FROM agente_propostas WHERE id = $1`,
    [id],
  );
}

// ----------------------------------------------------------------
// Base de conhecimento consolidada (lições generalizadas, deduplicadas por tópico)
// ----------------------------------------------------------------

/** Lista lições ativas para injetar como contexto na investigação (cliente-específicas + gerais). */
export async function listarConhecimentoAtivo(
  empresa_id: string,
  cliente_id?: string | null,
): Promise<AgenteConhecimento[]> {
  if (cliente_id) {
    return query<AgenteConhecimento>(
      `SELECT * FROM agente_conhecimento
       WHERE empresa_id = $1 AND ativa = TRUE AND (cliente_id = $2 OR cliente_id IS NULL)
       ORDER BY vezes_reforcada DESC LIMIT 20`,
      [empresa_id, cliente_id],
    );
  }
  return query<AgenteConhecimento>(
    `SELECT * FROM agente_conhecimento
     WHERE empresa_id = $1 AND ativa = TRUE AND cliente_id IS NULL
     ORDER BY vezes_reforcada DESC LIMIT 20`,
    [empresa_id],
  );
}

/**
 * Grava ou reforça uma lição consolidada. Deduplicada por (empresa_id, topico):
 * uma nova aprovação sobre o MESMO tópico atualiza/reforça a linha existente
 * em vez de criar uma nova — mantém a base pequena e sempre com o resumo mais atual.
 */
export async function upsertConhecimento(
  empresa_id: string,
  dados: { cliente_id?: string | null; topico: string; resumo: string },
): Promise<AgenteConhecimento> {
  const rows = await query<AgenteConhecimento>(
    `INSERT INTO agente_conhecimento (empresa_id, cliente_id, topico, resumo)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (empresa_id, topico) DO UPDATE SET
       resumo          = EXCLUDED.resumo,
       vezes_reforcada = agente_conhecimento.vezes_reforcada + 1,
       atualizado_em   = NOW()
     RETURNING *`,
    [empresa_id, dados.cliente_id ?? null, dados.topico.slice(0, 120), latin1Safe(dados.resumo)],
  );
  return rows[0];
}

/**
 * Lições mais relevantes para um texto (erro + contexto), por busca full-text com OR entre os termos —
 * websearch/plainto puros exigiriam TODOS os termos na mesma lição e quase nunca casariam com uma
 * mensagem de erro real. Se nada casar, cai nas lições mais reforçadas (comportamento antigo, mas com
 * limite menor) para não deixar o prompt sem nenhum conhecimento.
 */
export async function buscarLicoesRelevantes(
  empresa_id: string,
  cliente_id: string | null,
  texto: string,
  limite = 8,
): Promise<AgenteConhecimento[]> {
  const relevantes = await query<AgenteConhecimento>(
    // Só ficam as lições com rank de pelo menos 25% do melhor: casar apenas com palavras comuns
    // ("tabela", "erro") não é relevância e só gasta token do prompt.
    `WITH q AS (
       SELECT NULLIF(replace(plainto_tsquery('portuguese', $3)::text, ' & ', ' | '), '')::tsquery AS q
     ), r AS (
       SELECT k.*, ts_rank(to_tsvector('portuguese', k.topico || ' ' || k.resumo), q.q) AS rank
         FROM agente_conhecimento k, q
        WHERE k.empresa_id = $1 AND k.ativa = TRUE
          AND (k.cliente_id IS NULL OR k.cliente_id = $2::uuid)
          AND q.q IS NOT NULL
          AND to_tsvector('portuguese', k.topico || ' ' || k.resumo) @@ q.q
     )
     SELECT r.id, r.empresa_id, r.cliente_id, r.topico, r.resumo, r.vezes_reforcada, r.ativa, r.criado_em, r.atualizado_em
       FROM r
      WHERE r.rank >= (SELECT MAX(rank) FROM r) * 0.25
      ORDER BY r.rank DESC, r.vezes_reforcada DESC
      LIMIT $4`,
    [empresa_id, cliente_id, texto.slice(0, 1500), limite],
  );
  if (relevantes.length > 0) return relevantes;

  return query<AgenteConhecimento>(
    `SELECT * FROM agente_conhecimento
      WHERE empresa_id = $1 AND ativa = TRUE AND (cliente_id IS NULL OR cliente_id = $2::uuid)
      ORDER BY vezes_reforcada DESC LIMIT $3`,
    [empresa_id, cliente_id, Math.min(limite, 5)],
  );
}

// ----------------------------------------------------------------
// Autonomia: confiança por família de erro (assinatura)
// ----------------------------------------------------------------

/** Caso semelhante já resolvido: regra validada, com SQL, de OUTRA ocorrência da mesma assinatura. */
export async function buscarRegraAnaloga(
  empresa_id: string,
  assinatura_hash: string,
  excluirPatternHash: string,
): Promise<AgenteRegra | null> {
  return queryOne<AgenteRegra>(
    `SELECT * FROM agente_regras
      WHERE empresa_id = $1 AND assinatura_hash = $2 AND pattern_hash <> $3
        AND ativa = TRUE AND sql_correcao IS NOT NULL AND confianca >= 0.85
      ORDER BY confianca DESC, vezes_aplicada DESC, atualizado_em DESC
      LIMIT 1`,
    [empresa_id, assinatura_hash, excluirPatternHash],
  );
}

/** Regras salvas antes da coluna assinatura_hash existir: calcula e preenche (barato, em lote). */
export async function preencherAssinaturasRegras(empresa_id: string): Promise<void> {
  try {
    const pendentes = await query<{ id: string; pattern: string }>(
      `SELECT id, pattern FROM agente_regras
        WHERE empresa_id = $1 AND assinatura_hash IS NULL LIMIT 500`,
      [empresa_id],
    );
    for (const r of pendentes) {
      await query(`UPDATE agente_regras SET assinatura_hash = $1 WHERE id = $2`, [assinaturaErro(r.pattern).hash, r.id]);
    }
  } catch (e: any) {
    console.error('[agentes] falha ao preencher assinaturas das regras:', e?.message);
  }
}

export async function obterAutonomia(empresa_id: string, assinatura_hash: string): Promise<AgenteAutonomia | null> {
  return queryOne<AgenteAutonomia>(
    `SELECT * FROM agente_autonomia WHERE empresa_id = $1 AND assinatura_hash = $2`,
    [empresa_id, assinatura_hash],
  );
}

/** O erro sumiu depois da correção aplicada: +1 sucesso confirmado para a família. */
export async function registrarSucessoAutonomia(
  empresa_id: string,
  assinatura: { hash: string; normalizada: string },
): Promise<void> {
  await query(
    `INSERT INTO agente_autonomia
       (empresa_id, assinatura_hash, assinatura, sucessos_confirmados, total_sucessos, ultima_confirmacao_em)
     VALUES ($1, $2, $3, 1, 1, NOW())
     ON CONFLICT (empresa_id, assinatura_hash) DO UPDATE SET
       sucessos_confirmados  = agente_autonomia.sucessos_confirmados + 1,
       total_sucessos        = agente_autonomia.total_sucessos + 1,
       falhas_consecutivas   = 0,
       ultima_confirmacao_em = NOW(),
       atualizado_em         = NOW()`,
    [empresa_id, assinatura.hash, assinatura.normalizada],
  );
}

/** Recaída, SQL que falhou ou rejeição humana: zera os sucessos seguidos — volta a exigir humano. */
export async function registrarFalhaAutonomia(
  empresa_id: string,
  assinatura: { hash: string; normalizada: string },
): Promise<void> {
  await query(
    `INSERT INTO agente_autonomia
       (empresa_id, assinatura_hash, assinatura, sucessos_confirmados, falhas_consecutivas, total_falhas, ultima_falha_em)
     VALUES ($1, $2, $3, 0, 1, 1, NOW())
     ON CONFLICT (empresa_id, assinatura_hash) DO UPDATE SET
       sucessos_confirmados = 0,
       falhas_consecutivas  = agente_autonomia.falhas_consecutivas + 1,
       total_falhas         = agente_autonomia.total_falhas + 1,
       ultima_falha_em      = NOW(),
       atualizado_em        = NOW()`,
    [empresa_id, assinatura.hash, assinatura.normalizada],
  );
}

/**
 * Marca (ou desmarca) um tipo de erro para o agente executar sozinho. A marcação é decisão do operador
 * e independe dos sucessos confirmados; as travas de segurança do `tentarAutoAplicar` continuam valendo.
 */
export async function definirAutoAplicar(
  empresa_id: string,
  assinatura: { hash: string; normalizada: string },
  ligado: boolean,
  usuario_id?: string | null,
): Promise<void> {
  await query(
    `INSERT INTO agente_autonomia
       (empresa_id, assinatura_hash, assinatura, auto_aplicar, auto_aplicar_em, auto_aplicar_por)
     VALUES ($1, $2, $3, $4, CASE WHEN $4 THEN NOW() ELSE NULL END, CASE WHEN $4 THEN $5::uuid ELSE NULL END)
     ON CONFLICT (empresa_id, assinatura_hash) DO UPDATE SET
       auto_aplicar     = EXCLUDED.auto_aplicar,
       auto_aplicar_em  = EXCLUDED.auto_aplicar_em,
       auto_aplicar_por = EXCLUDED.auto_aplicar_por,
       atualizado_em    = NOW()`,
    [empresa_id, assinatura.hash, latin1Safe(assinatura.normalizada), ligado, usuario_id ?? null],
  );
}

/** Tipos de erro marcados para execução automática (tela de Configuração). */
export async function listarAutoAplicar(empresa_id: string): Promise<AgenteAutonomia[]> {
  return query<AgenteAutonomia>(
    `SELECT * FROM agente_autonomia
      WHERE empresa_id = $1 AND auto_aplicar = TRUE
      ORDER BY auto_aplicar_em DESC NULLS LAST`,
    [empresa_id],
  );
}

export async function contarAplicacoesDoAgente24h(empresa_id: string): Promise<number> {
  const r = await queryOne<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM agente_propostas
      WHERE empresa_id = $1 AND aplicado_por_agente = TRUE AND aplicado_em > NOW() - INTERVAL '24 hours'`,
    [empresa_id],
  );
  return Number(r?.n ?? 0);
}

/** Propostas aplicadas (por humano ou agente) ainda sem confirmação de que o erro sumiu. */
export async function listarAplicadasNaoConfirmadas(
  empresa_id: string,
  cliente_id: string,
  minutosCarencia: number,
): Promise<Array<{ id: string; erro_hash: string | null; painel_codigo: string | null; descricao_erro: string }>> {
  return query(
    `SELECT id, erro_hash, painel_codigo, descricao_erro FROM agente_propostas
      WHERE empresa_id = $1 AND cliente_id = $2 AND status = 'aplicada' AND confirmado_em IS NULL
        AND aplicado_em < NOW() - make_interval(mins => $3::int)
        AND aplicado_em > NOW() - INTERVAL '7 days'`,
    [empresa_id, cliente_id, minutosCarencia],
  );
}

export async function marcarConfirmada(id: string, empresa_id: string): Promise<void> {
  await query(
    `UPDATE agente_propostas SET confirmado_em = NOW() WHERE id = $1 AND empresa_id = $2`,
    [id, empresa_id],
  );
}
