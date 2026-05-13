import { NextResponse } from 'next/server';
import { query } from '@/lib/db-unified';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    // Verificar autenticação
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const result = await query(`
      SELECT id, nome, email, perfil
      FROM usuarios
      WHERE ativo = true AND perfil IN ('operador', 'supervisor')
      ORDER BY nome
    `);

    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar usuários atendentes:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}