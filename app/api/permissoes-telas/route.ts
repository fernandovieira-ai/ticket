import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

// GET /api/permissoes-telas - Buscar todas as permissões
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Apenas admin pode acessar
    if (session.perfil !== "admin") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    console.log("🔍 Buscando permissões para empresa:", session.empresaId);

    const rows = await query<{
      id: string;
      perfil: string;
      tela_rota: string;
      tela_nome: string;
      pode_acessar: boolean;
      pode_editar: boolean;
    }>(
      `SELECT
        pt.id,
        pt.perfil,
        pt.tela_rota,
        pt.tela_nome,
        pt.pode_acessar,
        pt.pode_editar
       FROM permissoes_telas pt
       WHERE pt.empresa_id = $1
       ORDER BY pt.tela_nome, pt.perfil`,
      [session.empresaId]
    );

    console.log("📊 Registros encontrados:", rows.length);

    // Agrupa por tela para facilitar a visualização
    const porTela: Record<string, any> = {};

    for (const row of rows) {
      const { tela_rota, tela_nome, perfil, pode_acessar, pode_editar } = row;

      if (!porTela[tela_rota]) {
        porTela[tela_rota] = {
          rota: tela_rota,
          nome: tela_nome,
          perfis: {}
        };
      }

      porTela[tela_rota].perfis[perfil] = {
        pode_acessar,
        pode_editar
      };
    }

    const telas = Object.values(porTela);

    console.log("✅ Retornando", telas.length, "telas");

    return NextResponse.json({ telas });
  } catch (error) {
    console.error("Erro ao buscar permissões:", error);
    return NextResponse.json(
      { error: "Erro ao buscar permissões" },
      { status: 500 }
    );
  }
}

// POST /api/permissoes-telas - Criar permissão para uma tela nova
export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (session.perfil !== "admin") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await request.json();
    const { tela_rota, tela_nome } = body;

    if (!tela_rota || !tela_nome) {
      return NextResponse.json(
        { error: "Rota e nome da tela são obrigatórios" },
        { status: 400 }
      );
    }

    // Cria permissões padrão para todos os perfis
    const perfis = ["admin", "supervisor", "operador", "somente_leitura"];

    for (const perfil of perfis) {
      const podeAcessar = perfil === "admin" || perfil === "supervisor";
      const podeEditar = perfil === "admin";

      await query(
        `INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (empresa_id, perfil, tela_rota) DO NOTHING`,
        [session.empresaId, perfil, tela_rota, tela_nome, podeAcessar, podeEditar]
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao criar permissão:", error);
    return NextResponse.json(
      { error: "Erro ao criar permissão" },
      { status: 500 }
    );
  }
}

// PATCH /api/permissoes-telas - Atualizar permissões
export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    if (session.perfil !== "admin") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const body = await request.json();
    const { tela_rota, perfil, pode_acessar, pode_editar } = body;

    if (!tela_rota || !perfil) {
      return NextResponse.json(
        { error: "Rota e perfil são obrigatórios" },
        { status: 400 }
      );
    }

    await query(
      `UPDATE permissoes_telas
       SET pode_acessar = $1, pode_editar = $2, atualizado_em = NOW()
       WHERE empresa_id = $3 AND perfil = $4 AND tela_rota = $5`,
      [pode_acessar, pode_editar, session.empresaId, perfil, tela_rota]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erro ao atualizar permissão:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar permissão" },
      { status: 500 }
    );
  }
}
