import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { UsuariosClient } from "./usuarios-client";
import { serverCache } from "@/lib/server-cache";
import type { UsuarioSemSenha, Departamento } from "@/types";

type UsuarioComDept = UsuarioSemSenha & { departamento_nome?: string | null };

// Server component que carrega dados iniciais dos usuários
export async function UsuariosServer() {
  const session = await getSession();

  if (!session) {
    return <div>Acesso negado</div>;
  }

  // Carregamento paralelo de dados essenciais
  const [usuariosIniciais, departamentosDisponiveis] = await Promise.all([
    // Usuários iniciais (primeira página)
    carregarUsuariosIniciais(session),
    // Departamentos que sempre serão usados
    carregarDepartamentos(session),
  ]) as [
    { data: UsuarioComDept[]; total: number },
    Departamento[]
  ];

  return (
    <UsuariosClient
      perfilAtual={session.perfil}
      usuariosIniciais={usuariosIniciais}
      departamentosIniciais={departamentosDisponiveis}
    />
  );
}

async function carregarUsuariosIniciais(session: any) {
  const cacheKey = `usuarios_inicial_${session.empresaId}`;

  // Tentar cache primeiro (30 segundos TTL)
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const usuarios = await query<UsuarioComDept>(`
      SELECT
        u.id, u.nome, u.email, u.perfil, u.telefone,
        u.whatsapp_jid, u.ativo, u.criado_em, u.atualizado_em,
        d.nome AS departamento_nome
      FROM usuarios u
      LEFT JOIN departamentos d ON d.id = u.departamento_id
      WHERE u.empresa_id = $1
      ORDER BY u.nome
      LIMIT 50
    `, [session.empresaId]);

    const result = {
      data: usuarios,
      total: usuarios.length,
    };

    // Cache por 30 segundos
    serverCache.set(cacheKey, result, 30000);
    return result;
  } catch (error) {
    console.error('[UsuariosServer] Erro ao carregar usuários:', error);
    return { data: [], total: 0 };
  }
}

async function carregarDepartamentos(session: any) {
  const cacheKey = `departamentos_${session.empresaId}`;

  // Tentar cache primeiro (5 minutos TTL - departamentos mudam menos)
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const departamentos = await query<Departamento>(`
      SELECT id, nome, descricao
      FROM departamentos
      WHERE empresa_id = $1
      ORDER BY nome
      LIMIT 50
    `, [session.empresaId]);

    // Cache por 5 minutos
    serverCache.set(cacheKey, departamentos, 5 * 60 * 1000);
    return departamentos;
  } catch (error) {
    console.error('[UsuariosServer] Erro ao carregar departamentos:', error);
    return [];
  }
}