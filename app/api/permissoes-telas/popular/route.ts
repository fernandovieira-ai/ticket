import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

const TELAS = [
  { rota: "/painel/dashboard", nome: "Dashboard" },
  { rota: "/painel/tickets", nome: "Tickets" },
  { rota: "/painel/solicitacoes", nome: "Solicitações" },
  { rota: "/painel/clientes", nome: "Clientes" },
  { rota: "/painel/whatsapp", nome: "WhatsApp" },
  { rota: "/painel/intranet", nome: "Intranet" },
  { rota: "/painel/relatorios", nome: "Relatórios" },
  { rota: "/painel/configuracoes", nome: "Configurações" },
];

const PERMISSOES_PADRAO: Record<
  string,
  { pode_acessar: boolean; pode_editar: boolean }
> = {
  admin: { pode_acessar: true, pode_editar: true },
  supervisor: { pode_acessar: true, pode_editar: true },
  operador: { pode_acessar: true, pode_editar: true },
  somente_leitura: { pode_acessar: true, pode_editar: false },
};

// Permissões específicas por tela
const PERMISSOES_ESPECIAIS: Record<
  string,
  Record<string, { pode_acessar: boolean; pode_editar: boolean }>
> = {
  "/painel/whatsapp": {
    operador: { pode_acessar: false, pode_editar: false },
    somente_leitura: { pode_acessar: false, pode_editar: false },
  },
  "/painel/relatorios": {
    operador: { pode_acessar: false, pode_editar: false },
    somente_leitura: { pode_acessar: false, pode_editar: false },
  },
  "/painel/configuracoes": {
    supervisor: { pode_acessar: false, pode_editar: false },
    operador: { pode_acessar: false, pode_editar: false },
    somente_leitura: { pode_acessar: false, pode_editar: false },
  },
};

// POST /api/permissoes-telas/popular - Popular permissões iniciais
export async function POST() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    // Apenas admin pode popular
    if (session.perfil !== "admin") {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }

    const empresaId = session.empresaId;
    console.log("🔧 Populando permissões para empresa:", empresaId);
    let inseridas = 0;

    for (const tela of TELAS) {
      const perfis = ["admin", "supervisor", "operador", "somente_leitura"];

      for (const perfil of perfis) {
        // Usa permissões especiais se existirem, senão usa as padrões
        const permissoes =
          PERMISSOES_ESPECIAIS[tela.rota]?.[perfil] ||
          PERMISSOES_PADRAO[perfil];

        await query(
          `INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (empresa_id, perfil, tela_rota)
           DO UPDATE SET
             pode_acessar = EXCLUDED.pode_acessar,
             pode_editar = EXCLUDED.pode_editar,
             atualizado_em = NOW()`,
          [
            empresaId,
            perfil,
            tela.rota,
            tela.nome,
            permissoes.pode_acessar,
            permissoes.pode_editar,
          ]
        );

        inseridas++;
      }
    }

    console.log("✅ Permissões inseridas:", inseridas);

    return NextResponse.json({
      success: true,
      message: `${inseridas} permissões criadas/atualizadas com sucesso!`,
      telas: TELAS.length,
    });
  } catch (error) {
    console.error("Erro ao popular permissões:", error);
    return NextResponse.json(
      { error: "Erro ao popular permissões" },
      { status: 500 }
    );
  }
}
