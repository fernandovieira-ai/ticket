import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { analisarMensagensGrupo } from "@/lib/ia";

type Params = { params: Promise<{ id: string }> };

// POST /api/whatsapp/grupos/[id]/analisar
// Body: { desde?: string (ISO), ate?: string (ISO) }
// Padrão: últimas 24 horas
export async function POST(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor", "operador"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { id } = await params;

  const grupo = await queryOne<{ id: string; nome: string; monitorado: boolean }>(
    `SELECT id, nome, monitorado FROM whatsapp_grupos WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId]
  );
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado" }, { status: 404 });
  if (!grupo.monitorado)
    return NextResponse.json({ error: "Grupo não está sendo monitorado" }, { status: 422 });

  const body = await req.json().catch(() => ({})) as Record<string, string>;
  const ate   = body.ate   ? new Date(body.ate)   : new Date();
  const desde = body.desde ? new Date(body.desde) : new Date(ate.getTime() - 24 * 60 * 60 * 1000);

  try {
    const analise = await analisarMensagensGrupo({
      grupoId: id,
      empresaId: session.empresaId,
      usuarioId: session.id,
      periodoInicio: desde,
      periodoFim: ate,
    });

    return NextResponse.json(analise, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
