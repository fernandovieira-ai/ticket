import { query } from "@/lib/db";
import type { PerfilUsuario } from "@/types";

/**
 * Verifica se um perfil tem permissão para acessar uma tela
 */
export async function verificarPermissao(
  empresaId: string,
  perfil: PerfilUsuario,
  telaRota: string,
  tipo: "pode_acessar" | "pode_editar" = "pode_acessar"
): Promise<boolean> {
  try {
    // Admin sempre tem acesso total
    if (perfil === "admin") {
      return true;
    }

    const result = await query<Record<string, boolean>>(
      `SELECT ${tipo}
       FROM permissoes_telas
       WHERE empresa_id = $1 AND perfil = $2 AND tela_rota = $3`,
      [empresaId, perfil, telaRota]
    );

    if (result.length === 0) {
      // Se não houver permissão configurada, permite por padrão
      // (comportamento legado para empresas que ainda não configuraram)
      return true;
    }

    return result[0][tipo] === true;
  } catch (error) {
    console.error("Erro ao verificar permissão:", error);
    // Em caso de erro, permite por segurança (evita bloquear usuários)
    return true;
  }
}

/**
 * Busca todas as permissões de um perfil
 */
export async function buscarPermissoesPerfil(
  empresaId: string,
  perfil: PerfilUsuario
): Promise<Map<string, { pode_acessar: boolean; pode_editar: boolean }>> {
  try {
    // Admin sempre tem acesso total
    if (perfil === "admin") {
      return new Map();
    }

    const result = await query<{
      tela_rota: string;
      pode_acessar: boolean;
      pode_editar: boolean;
    }>(
      `SELECT tela_rota, pode_acessar, pode_editar
       FROM permissoes_telas
       WHERE empresa_id = $1 AND perfil = $2`,
      [empresaId, perfil]
    );

    const permissoes = new Map<
      string,
      { pode_acessar: boolean; pode_editar: boolean }
    >();

    for (const row of result) {
      permissoes.set(row.tela_rota, {
        pode_acessar: row.pode_acessar,
        pode_editar: row.pode_editar,
      });
    }

    return permissoes;
  } catch (error) {
    console.error("Erro ao buscar permissões:", error);
    return new Map();
  }
}
