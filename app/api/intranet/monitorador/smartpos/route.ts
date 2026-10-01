import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { verificarPermissao } from "@/lib/permissoes";
import { listarSmartpos, criarSmartpos, normalizarCnpj } from "@/lib/smartpos";

export const dynamic = "force-dynamic";

// GET /api/intranet/monitorador/smartpos
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const dados = await listarSmartpos();
    return NextResponse.json(dados);
  } catch (error) {
    console.error("Erro ao buscar clientes Smart POS:", error);
    return NextResponse.json(
      { error: "Erro ao buscar clientes Smart POS" },
      { status: 500 }
    );
  }
}

// POST /api/intranet/monitorador/smartpos
export async function POST(req: NextRequest) {
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
    const cliente = await criarSmartpos(cnpj, nomeCliente, indAtivo);
    return NextResponse.json({ success: true, data: cliente });
  } catch (error: any) {
    if (error?.code === "23505") {
      return NextResponse.json({ error: "Já existe um cliente cadastrado com esse CNPJ" }, { status: 409 });
    }
    console.error("Erro ao cadastrar cliente Smart POS:", error);
    return NextResponse.json({ error: "Erro ao cadastrar cliente Smart POS" }, { status: 500 });
  }
}
