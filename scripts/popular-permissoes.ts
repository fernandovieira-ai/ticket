/**
 * Script para popular a tabela permissoes_telas com dados iniciais
 * Execute com: npx tsx scripts/popular-permissoes.ts
 */

import { query } from "../lib/db";

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

const PERMISSOES_PADRAO: Record<string, { pode_acessar: boolean; pode_editar: boolean }> = {
  admin: { pode_acessar: true, pode_editar: true },
  supervisor: { pode_acessar: true, pode_editar: true },
  operador: { pode_acessar: true, pode_editar: true },
  somente_leitura: { pode_acessar: true, pode_editar: false },
};

// Permissões específicas por tela
const PERMISSOES_ESPECIAIS: Record<string, Record<string, { pode_acessar: boolean; pode_editar: boolean }>> = {
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

async function popularPermissoes() {
  try {
    console.log("🔍 Buscando empresas...");

    // Busca todas as empresas
    const empresas = await query<{ id: string; nome: string }>("SELECT id, nome FROM empresas");

    if (empresas.length === 0) {
      console.error("❌ Nenhuma empresa encontrada no banco de dados!");
      process.exit(1);
    }

    console.log(`✅ Encontradas ${empresas.length} empresa(s)`);

    for (const empresa of empresas) {
      console.log(`\n📊 Processando empresa: ${empresa.nome}`);

      for (const tela of TELAS) {
        console.log(`  └─ Tela: ${tela.nome}`);

        const perfis = ["admin", "supervisor", "operador", "somente_leitura"];

        for (const perfil of perfis) {
          // Usa permissões especiais se existirem, senão usa as padrões
          const permissoes = PERMISSOES_ESPECIAIS[tela.rota]?.[perfil] || PERMISSOES_PADRAO[perfil];

          try {
            await query(
              `INSERT INTO permissoes_telas (empresa_id, perfil, tela_rota, tela_nome, pode_acessar, pode_editar)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (empresa_id, perfil, tela_rota)
               DO UPDATE SET
                 pode_acessar = EXCLUDED.pode_acessar,
                 pode_editar = EXCLUDED.pode_editar,
                 atualizado_em = NOW()`,
              [empresa.id, perfil, tela.rota, tela.nome, permissoes.pode_acessar, permissoes.pode_editar]
            );
          } catch (error) {
            console.error(`    ❌ Erro ao inserir ${perfil}:`, error);
          }
        }
      }
    }

    console.log("\n✅ Permissões populadas com sucesso!");

    // Mostra resumo
    const total = await query<{ total: number }>("SELECT COUNT(*) as total FROM permissoes_telas");
    console.log(`📈 Total de permissões criadas: ${total[0].total}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao popular permissões:", error);
    process.exit(1);
  }
}

popularPermissoes();
