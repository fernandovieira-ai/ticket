import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db-unified";
import { getSession } from "@/lib/auth";
import { verificarPermissao } from "@/lib/permissoes";

// PUT /api/intranet/monitorador/[machine_uuid]/status
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
  const { situacao_cadastral } = await req.json();

  if (!situacao_cadastral || !["ativo", "bloqueado"].includes(situacao_cadastral)) {
    return NextResponse.json(
      { error: "Situação cadastral inválida. Use 'ativo' ou 'bloqueado'" },
      { status: 400 }
    );
  }

  try {
    // Atualiza o status - o app verificará este campo ao tentar enviar dados
    const result = await query(
      `UPDATE drf_monitor_rede
       SET situacao_cadastral = $1, atualizado_em = NOW()
       WHERE machine_uuid = $2
       RETURNING *`,
      [situacao_cadastral, machine_uuid]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Máquina não encontrada" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: `Máquina ${situacao_cadastral === 'ativo' ? 'ativada' : 'bloqueada'} com sucesso`,
      data: result.rows[0]
    });
  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar status" },
      { status: 500 }
    );
  }
}
