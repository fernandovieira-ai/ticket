import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";
import { verificarPermissao } from "@/lib/permissoes";

// PUT /api/intranet/monitorador/processos/[id]/toggle
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
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
  const { id } = await context.params;
  const { ativo } = await req.json();

  if (typeof ativo !== "boolean") {
    return NextResponse.json(
      { error: "Parâmetro 'ativo' deve ser um booleano" },
      { status: 400 }
    );
  }

  try {
    // Atualiza o status do processo
    const result = await query(
      `UPDATE drf_monitor_processos
       SET ativo = $1, atualizado_em = NOW()
       WHERE id = $2
       RETURNING *`,
      [ativo, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Processo não encontrado" }, { status: 404 });
    }

    const processo = result.rows[0];
    return NextResponse.json({
      success: true,
      message: `Processo ${ativo ? 'ativado' : 'desativado'} com sucesso`,
      data: processo
    });
  } catch (error) {
    console.error("Erro ao alterar status do processo:", error);
    return NextResponse.json(
      { error: "Erro ao alterar status do processo" },
      { status: 500 }
    );
  }
}
