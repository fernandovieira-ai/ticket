import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verificarPermissao } from "@/lib/permissoes";
import { atualizarSmartpos, removerSmartpos, normalizarCnpj } from "@/lib/smartpos";

export const dynamic = "force-dynamic";

// PUT /api/intranet/monitorador/smartpos/[id]
export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const podeEditar = await verificarPermissao(
    session.empresaId,
    session.perfil,
    "/painel/intranet/monitorador",
    "pode_editar"
  );
  if (!podeEditar) {
    return NextResponse.json({ error: "Sem permissão para editar" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await req.json();
  const cnpj = normalizarCnpj(body.cnpj);
  const nomeCliente = String(body.nome_cliente ?? "").trim();
  const indAtivo = body.ind_ativo !== false;

  if (!cnpj) {
    return NextResponse.json({ error: "CNPJ inválido" }, { status: 400 });
  }
  if (!nomeCliente) {
    return NextResponse.json({ error: "Nome do cliente é obrigatório" }, { status: 400 });
  }

  try {
    const cliente = await atualizarSmartpos(Number(id), cnpj, nomeCliente, indAtivo);
    if (!cliente) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: cliente });
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Já existe um cliente cadastrado com esse CNPJ" }, { status: 409 });
    }
    console.error("Erro ao atualizar cliente Smart POS:", error);
    return NextResponse.json({ error: "Erro ao atualizar cliente Smart POS" }, { status: 500 });
  }
}

// DELETE /api/intranet/monitorador/smartpos/[id]
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const podeEditar = await verificarPermissao(
    session.empresaId,
    session.perfil,
    "/painel/intranet/monitorador",
    "pode_editar"
  );
  if (!podeEditar) {
    return NextResponse.json({ error: "Sem permissão para editar" }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const removido = await removerSmartpos(Number(id));
    if (!removido) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao remover cliente Smart POS:", error);
    return NextResponse.json({ error: "Erro ao remover cliente Smart POS" }, { status: 500 });
  }
}
