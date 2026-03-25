import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { analisarMensagensGrupo } from "@/lib/ia";

// GET /api/relatorios/grupos — lista relatórios gerados
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const grupoId = sp.get("grupo_id");
  const status = sp.get("status");
  const page = Math.max(1, parseInt(sp.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, parseInt(sp.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const conds: string[] = ["r.empresa_id = $1"];
  const vals: unknown[] = [session.empresaId];
  let p = 2;

  if (grupoId) {
    conds.push(`r.grupo_id = $${p++}`);
    vals.push(grupoId);
  }
  if (status) {
    conds.push(`r.status = $${p++}`);
    vals.push(status);
  }

  const where = conds.join(" AND ");

  const [totalRow] = await query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM relatorios_grupos r WHERE ${where}`,
    vals,
  );

  const relatorios = await query<Record<string, unknown>>(
    `SELECT r.id, r.grupo_id, g.nome AS grupo_nome,
            r.titulo, r.tipo, r.formato, r.status,
            r.periodo_inicio, r.periodo_fim,
            r.url_arquivo, r.erro,
            u.nome AS gerado_por_nome,
            r.criado_em, r.atualizado_em
     FROM relatorios_grupos r
     LEFT JOIN whatsapp_grupos g ON g.id = r.grupo_id
     LEFT JOIN usuarios u ON u.id = r.gerado_por
     WHERE ${where}
     ORDER BY r.criado_em DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...vals, limit, offset],
  );

  return NextResponse.json({
    data: relatorios,
    total: parseInt(totalRow?.total ?? "0"),
    page,
    limit,
    pages: Math.ceil(parseInt(totalRow?.total ?? "0") / limit),
  });
}

// POST /api/relatorios/grupos — gera novo relatório
// Body: { grupo_id?: string, desde: string, ate: string, tipo?: string }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = (await req.json()) as Record<string, string>;
  const { grupo_id, desde, ate, tipo = "analise_periodo" } = body;

  if (!desde || !ate)
    return NextResponse.json(
      { error: "desde e ate são obrigatórios" },
      { status: 400 },
    );

  const periodoInicio = new Date(desde);
  const periodoFim = new Date(ate);

  if (isNaN(periodoInicio.getTime()) || isNaN(periodoFim.getTime()))
    return NextResponse.json({ error: "Datas inválidas" }, { status: 400 });

  // Se grupo_id informado, valida que pertence à empresa
  if (grupo_id) {
    const grupo = await queryOne<{ id: string; monitorado: boolean }>(
      `SELECT id, monitorado FROM whatsapp_grupos WHERE id = $1 AND empresa_id = $2`,
      [grupo_id, session.empresaId],
    );
    if (!grupo)
      return NextResponse.json(
        { error: "Grupo não encontrado" },
        { status: 404 },
      );
    if (!grupo.monitorado)
      return NextResponse.json(
        { error: "Grupo não está sendo monitorado" },
        { status: 422 },
      );
  }

  // Cria registro com status processando
  const [rel] = await query<{ id: string }>(
    `INSERT INTO relatorios_grupos
       (empresa_id, grupo_id, titulo, tipo, formato, periodo_inicio, periodo_fim,
        status, gerado_por)
     VALUES ($1, $2, $3, $4, 'json', $5, $6, 'processando', $7)
     RETURNING id`,
    [
      session.empresaId,
      grupo_id ?? null,
      `Análise ${tipo} — ${periodoInicio.toLocaleDateString("pt-BR")} a ${periodoFim.toLocaleDateString("pt-BR")}`,
      tipo,
      periodoInicio,
      periodoFim,
      session.sub,
    ],
  );

  // Processa de forma assíncrona (fire-and-forget)
  gerarRelatorio({
    relatorioId: rel.id,
    empresaId: session.empresaId,
    usuarioId: session.sub,
    grupoId: grupo_id ?? null,
    periodoInicio,
    periodoFim,
  }).catch((err) => console.error("[relatorios/grupos]", err));

  return NextResponse.json(
    { id: rel.id, status: "processando" },
    { status: 202 },
  );
}

async function gerarRelatorio(p: {
  relatorioId: string;
  empresaId: string;
  usuarioId: string;
  grupoId: string | null;
  periodoInicio: Date;
  periodoFim: Date;
}) {
  const { query: dbQuery } = await import("@/lib/db");

  try {
    // Se grupo específico: analisa só ele. Se null: analisa todos os grupos monitorados.
    const grupos = p.grupoId
      ? [{ id: p.grupoId }]
      : await dbQuery<{ id: string }>(
          `SELECT id FROM whatsapp_grupos
           WHERE empresa_id = $1 AND monitorado = TRUE AND ativo = TRUE`,
          [p.empresaId],
        );

    const analises = [];
    for (const g of grupos) {
      try {
        const analise = await analisarMensagensGrupo({
          grupoId: g.id,
          empresaId: p.empresaId,
          usuarioId: p.usuarioId,
          periodoInicio: p.periodoInicio,
          periodoFim: p.periodoFim,
        });
        analises.push(analise);
      } catch (err) {
        console.error(`[relatorio] Falha ao analisar grupo ${g.id}:`, err);
      }
    }

    await dbQuery(
      `UPDATE relatorios_grupos
       SET status = 'concluido', conteudo = $1, atualizado_em = NOW()
       WHERE id = $2`,
      [JSON.stringify({ analises }), p.relatorioId],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await dbQuery(
      `UPDATE relatorios_grupos
       SET status = 'erro', erro = $1, atualizado_em = NOW()
       WHERE id = $2`,
      [msg, p.relatorioId],
    );
  }
}
