import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";
import { getEvolutionConfig } from "@/lib/whatsapp";

type Params = { params: Promise<{ id: string }> };

// GET /api/whatsapp/grupos/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;

  const grupo = await queryOne<Record<string, unknown>>(
    `SELECT g.id, g.instancia_id, wi.nome_instancia AS instancia_nome,
            g.group_jid, g.nome, g.descricao, g.foto_url,
            g.total_membros, g.monitorado, g.ativo,
            g.sincronizado_em, g.criado_em, g.atualizado_em,
            (SELECT COUNT(*) FROM whatsapp_grupos_mensagens WHERE grupo_id = g.id) AS total_mensagens,
            (SELECT COUNT(*) FROM whatsapp_grupos_analises WHERE grupo_id = g.id) AS total_analises
     FROM whatsapp_grupos g
     JOIN whatsapp_instancias wi ON wi.id = g.instancia_id
     WHERE g.id = $1 AND g.empresa_id = $2`,
    [id, session.empresaId]
  );

  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  return NextResponse.json(grupo);
}

// PUT /api/whatsapp/grupos/[id]
// Permite atualizar monitorado, ativo e nome.
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const existente = await queryOne<{ id: string }>(
    `SELECT id FROM whatsapp_grupos WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!existente) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  const body = await req.json() as Record<string, unknown>;
  const campos: string[] = [];
  const valores: unknown[] = [];
  let idx = 1;

  if (typeof body.monitorado === "boolean") { campos.push(`monitorado = $${idx++}`); valores.push(body.monitorado); }
  if (typeof body.ativo === "boolean")      { campos.push(`ativo = $${idx++}`);      valores.push(body.ativo); }
  if (typeof body.nome === "string" && body.nome.trim()) {
    campos.push(`nome = $${idx++}`);
    valores.push(body.nome.trim());
  }

  if (campos.length === 0)
    return NextResponse.json({ error: "Nenhum campo para atualizar" }, { status: 400 });

  valores.push(id);
  await query(
    `UPDATE whatsapp_grupos SET ${campos.join(", ")} WHERE id = $${idx}`,
    valores
  );

  return NextResponse.json({ ok: true });
}

// DELETE /api/whatsapp/grupos/[id]
// Remove o grupo do banco (e opcionalmente sai do grupo na Evolution API)
// Query param: sair=true  → chama Evolution API para sair do grupo antes de remover
export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;
  const sairDoGrupo = req.nextUrl.searchParams.get("sair") === "true";

  const grupo = await queryOne<{ id: string; group_jid: string; instancia_id: string }>(
    `SELECT g.id, g.group_jid, g.instancia_id
     FROM whatsapp_grupos g
     WHERE g.id = $1 AND g.empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });

  // Sair e deletar o grupo via Evolution API (melhor esforço)
  if (sairDoGrupo) {
    try {
      const instancia = await queryOne<{ nome_instancia: string }>(
        `SELECT nome_instancia FROM whatsapp_instancias WHERE id = $1`,
        [grupo.instancia_id]
      );
      const evo = await getEvolutionConfig(session.empresaId);
      if (evo && instancia) {
        // Tenta deletar o grupo do WhatsApp (apaga para todos)
        await fetch(
          `${evo.url}/group/deleteGroup/${instancia.nome_instancia}`,
          {
            method: "DELETE",
            headers: { apikey: evo.key, "Content-Type": "application/json" },
            body: JSON.stringify({ groupJid: grupo.group_jid }),
          }
        );
        // Se deleteGroup não suportado, tenta pelo menos sair do grupo
        await fetch(
          `${evo.url}/group/leaveGroup/${instancia.nome_instancia}`,
          {
            method: "DELETE",
            headers: { apikey: evo.key, "Content-Type": "application/json" },
            body: JSON.stringify({ groupJid: grupo.group_jid }),
          }
        );
      }
    } catch {
      // Não bloqueia a remoção local se a API falhar
    }
  }

  // Remove dados associados e o grupo
  await query(`DELETE FROM whatsapp_grupos_analises WHERE grupo_id = $1`, [id]);
  await query(`DELETE FROM whatsapp_grupos_mensagens WHERE grupo_id = $1`, [id]);
  await query(`DELETE FROM whatsapp_grupos WHERE id = $1`, [id]);

  return NextResponse.json({ ok: true });
}
