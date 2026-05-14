import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  console.log('🔍 Debug - Empresa ID da sessão:', session.empresaId);

  // Buscar TODOS os status (sem filtrar por empresa primeiro)
  const todosStatus = await query<{
    id: string;
    codigo: string;
    nome: string;
    cor: string;
    ordem: number;
    encerra: boolean;
    ativo: boolean;
    empresa_id: string | null;
  }>(
    `SELECT id, codigo, nome, cor, ordem, encerra, ativo, empresa_id
     FROM ticket_status
     ORDER BY empresa_id NULLS FIRST, ordem`
  );

  // Buscar status filtrados (como a API original faz)
  const statusFiltrados = await query<{
    id: string;
    codigo: string;
    nome: string;
    cor: string;
    ordem: number;
    encerra: boolean;
    ativo: boolean;
    empresa_id: string | null;
  }>(
    `SELECT id, codigo, nome, cor, ordem, encerra, ativo, empresa_id
     FROM ticket_status
     WHERE (empresa_id = $1 OR empresa_id IS NULL) AND ativo = true
     ORDER BY ordem`,
    [session.empresaId],
  );

  return NextResponse.json({
    sessao: {
      empresaId: session.empresaId,
      perfil: session.perfil,
      nome: session.nome
    },
    todosStatus,
    statusFiltrados,
    resumo: {
      totalStatus: todosStatus.length,
      statusFiltrados: statusFiltrados.length,
      statusAbertos: statusFiltrados.filter(s => !s.encerra).length,
      statusQueEncerram: statusFiltrados.filter(s => s.encerra).length
    }
  });
}