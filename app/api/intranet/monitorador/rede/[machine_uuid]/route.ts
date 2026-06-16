import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";
import { verificarPermissao } from "@/lib/permissoes";

// PUT /api/intranet/monitorador/rede/[machine_uuid]
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ machine_uuid: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Verifica se tem permissão de edição
  const podeEditar = await verificarPermissao(
    session.empresaId,
    session.perfil,
    '/painel/intranet/monitorador',
    'pode_editar'
  );

  if (!podeEditar) {
    return NextResponse.json({ error: "Sem permissão para editar" }, { status: 403 });
  }

  // Await params (Next.js 15+)
  const { machine_uuid } = await context.params;
  const { nome_rede } = await req.json();

  if (!nome_rede || nome_rede.trim().length === 0) {
    return NextResponse.json(
      { error: "Nome da rede é obrigatório" },
      { status: 400 }
    );
  }

  try {
    // Atualiza o nome da rede
    const result = await query(
      `UPDATE drf_monitor_rede
       SET nome_rede = $1, atualizado_em = NOW()
       WHERE machine_uuid = $2
       RETURNING *`,
      [nome_rede.trim(), machine_uuid]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Máquina não encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: "Nome da rede atualizado com sucesso",
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Erro ao atualizar nome da rede:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar nome da rede" },
      { status: 500 }
    );
  }
}
