import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/admin/fix-subcategoria-constraint
// Rota temporária para corrigir foreign key constraint da subcategoria_id em solicitacoes_internas
// Apagar este arquivo após executar uma vez.
export async function GET() {
  const session = await getSession();
  if (!session || session.perfil !== "admin") {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  try {
    // 1. Remove a constraint incorreta (se existir)
    await query(`
      ALTER TABLE solicitacoes_internas
      DROP CONSTRAINT IF EXISTS solicitacoes_internas_subcategoria_id_fkey;
    `);

    // 2. Adiciona a constraint correta referenciando subcategorias table
    await query(`
      ALTER TABLE solicitacoes_internas
      ADD CONSTRAINT solicitacoes_internas_subcategoria_id_fkey
      FOREIGN KEY (subcategoria_id) REFERENCES subcategorias(id);
    `);

    return NextResponse.json({
      ok: true,
      mensagem: "Foreign key constraint corrigida. Apague o arquivo app/api/admin/fix-subcategoria-constraint/route.ts"
    });
  } catch (error) {
    console.error("Erro ao corrigir constraint:", error);
    return NextResponse.json({
      error: "Erro ao executar migração",
      details: error
    }, { status: 500 });
  }
}