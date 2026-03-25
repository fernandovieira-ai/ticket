import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// GET /api/whatsapp/grupos/[id]/mensagens
// Query params: page (default 1), limit (default 50), tipo, remetente_jid, desde, ate
export async function GET(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const grupo = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_grupos WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const page    = Math.max(1, parseInt(sp.get("page") ?? "1"));
  const limit   = Math.min(100, Math.max(1, parseInt(sp.get("limit") ?? "50")));
  const offset  = (page - 1) * limit;
  const tipo    = sp.get("tipo");
  const remJid  = sp.get("remetente_jid");
  const desde   = sp.get("desde");
  const ate     = sp.get("ate");

  const conds: string[] = ["m.grupo_id = $1"];
  const vals: unknown[] = [id];
  let p = 2;

  if (tipo)   { conds.push(`m.tipo = $${p++}`);                vals.push(tipo); }
  if (remJid) { conds.push(`m.remetente_jid = $${p++}`);       vals.push(remJid); }
  if (desde)  { conds.push(`m.criado_em >= $${p++}`);          vals.push(desde); }
  if (ate)    { conds.push(`m.criado_em <= $${p++}`);          vals.push(ate); }

  const where = conds.join(" AND ");

  const [totalRow] = await query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM whatsapp_grupos_mensagens m WHERE ${where}`,
    vals
  );

  const mensagens = await query<{
    id: string;
    message_id: string | null;
    remetente_jid: string;
    remetente_nome: string | null;
    tipo: string;
    conteudo: string | null;
    midia_url: string | null;
    criado_em: string;
  }>(
    `SELECT m.id, m.message_id, m.remetente_jid, m.remetente_nome,
            m.tipo, m.conteudo, m.midia_url, m.criado_em
     FROM whatsapp_grupos_mensagens m
     WHERE ${where}
     ORDER BY m.criado_em DESC
     LIMIT $${p} OFFSET $${p + 1}`,
    [...vals, limit, offset]
  );

  return NextResponse.json({
    data: mensagens,
    total: parseInt(totalRow?.total ?? "0"),
    page,
    limit,
    pages: Math.ceil(parseInt(totalRow?.total ?? "0") / limit),
  });
}
