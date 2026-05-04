import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";

const criarSolicitacaoSchema = z.object({
  tipo_id: z.string().uuid(),
  titulo: z.string().min(3).max(200),
  descricao: z.string().optional().nullable(),
  prioridade_id: z.string().uuid().optional().nullable(),
  departamento_dest: z.string().uuid().optional().nullable(),
  responsavel_id: z.string().uuid().optional().nullable(),
  prazo: z.string().optional().nullable(),
  categoria_id: z.string().uuid().optional().nullable(),
  subcategoria_id: z.string().uuid().optional().nullable(),
});

// GET /api/solicitacoes
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const busca = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "";
  const tipoId = searchParams.get("tipo_id") ?? "";
  const minhas = searchParams.get("minhas") === "1";
  const responsavel = searchParams.get("responsavel") === "1";
  const pagina = Math.max(1, Number(searchParams.get("page") ?? 1));
  const tamanho = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? 20)));
  const offset = (pagina - 1) * tamanho;

  const rows = await query<{
    id: string;
    titulo: string;
    status: string;
    tipo_nome: string;
    tipo_icone: string | null;
    tipo_cor: string;
    prioridade_nome: string | null;
    prioridade_cor: string | null;
    solicitante_nome: string;
    responsavel_nome: string | null;
    departamento_nome: string | null;
    categoria_nome: string | null;
    subcategoria_nome: string | null;
    prazo: string | null;
    criado_em: Date;
    atualizado_em: Date;
    total_count: number;
  }>(
    `SELECT
       s.id, s.titulo, s.status, s.prazo, s.criado_em, s.atualizado_em,
       st.nome AS tipo_nome, st.icone AS tipo_icone, st.cor AS tipo_cor,
       tp.nome AS prioridade_nome, tp.cor AS prioridade_cor,
       us.nome AS solicitante_nome,
       ur.nome AS responsavel_nome,
       d.nome AS departamento_nome,
       c.nome AS categoria_nome,
       sc.nome AS subcategoria_nome,
       COUNT(*) OVER() AS total_count
     FROM solicitacoes_internas s
     JOIN solicitacao_tipos st ON st.id = s.tipo_id
     LEFT JOIN ticket_prioridades tp ON tp.id = s.prioridade_id
     JOIN usuarios us ON us.id = s.solicitante_id
     LEFT JOIN usuarios ur ON ur.id = s.responsavel_id
     LEFT JOIN departamentos d ON d.id = s.departamento_dest
     LEFT JOIN categorias c ON c.id = s.categoria_id
     LEFT JOIN subcategorias sc ON sc.id = s.subcategoria_id
     WHERE s.empresa_id = $1
       AND ($2 = '' OR s.titulo ILIKE $2)
       AND ($3 = '' OR s.status = $3::status_solicitacao)
       AND ($4::uuid IS NULL OR s.tipo_id = $4::uuid)
       AND (NOT $5::boolean OR s.solicitante_id = $6::uuid)
       AND (NOT $7::boolean OR s.responsavel_id = $6::uuid)
     ORDER BY s.criado_em DESC
     LIMIT $8 OFFSET $9`,
    [
      session.empresaId,
      busca ? `%${busca}%` : "",
      status,
      tipoId || null,
      minhas,
      session.sub,
      responsavel,
      tamanho,
      offset,
    ],
  );

  return NextResponse.json({
    data: rows,
    total: rows[0]?.total_count ?? 0,
    page: pagina,
    pageSize: tamanho,
  });
}

// POST /api/solicitacoes
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = criarSolicitacaoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    tipo_id,
    titulo,
    descricao,
    prioridade_id,
    departamento_dest,
    responsavel_id,
    prazo,
    categoria_id,
    subcategoria_id,
  } = parsed.data;

  // Validar que o tipo existe e pertence à empresa
  const tipo = await queryOne<{ id: string }>(
    `SELECT id FROM solicitacao_tipos
     WHERE id = $1 AND (empresa_id = $2 OR empresa_id IS NULL) AND ativo = true`,
    [tipo_id, session.empresaId],
  );
  if (!tipo)
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });

  const solicitacao = await queryOne<{ id: string; criado_em: Date }>(
    `INSERT INTO solicitacoes_internas
       (empresa_id, tipo_id, titulo, descricao, prioridade_id,
        solicitante_id, departamento_dest, responsavel_id, prazo,
        categoria_id, subcategoria_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10, $11)
     RETURNING id, criado_em`,
    [
      session.empresaId,
      tipo_id,
      titulo,
      descricao ?? null,
      prioridade_id ?? null,
      session.sub,
      departamento_dest ?? null,
      responsavel_id ?? null,
      prazo ?? null,
      categoria_id ?? null,
      subcategoria_id ?? null,
    ],
  );

  if (!solicitacao)
    return NextResponse.json({ error: "Erro ao criar solicitação" }, { status: 500 });

  // Registrar mensagem inicial se houver descrição
  if (descricao) {
    await query(
      `INSERT INTO mensagens_solicitacao (solicitacao_id, autor_id, corpo)
       VALUES ($1, $2, $3)`,
      [solicitacao.id, session.sub, descricao],
    );
  }

  return NextResponse.json(solicitacao, { status: 201 });
}
