import { NextRequest, NextResponse } from 'next/server';
import { queryIntranet } from '@/lib/db-unified';
import { getSession } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticação
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { dtainicio, dtafinal, analista, dia_semana, observacao } = body;

    // Validar campos obrigatórios
    if (!dtainicio || !dtafinal || !analista) {
      return NextResponse.json(
        { error: 'Data início, data final e analista são obrigatórios' },
        { status: 400 }
      );
    }

    // Inserir novo plantão
    const result = await queryIntranet(`
      INSERT INTO plantao (dtainicio, dtafinal, analista, dia_semana, observacao, ind_finalizado)
      VALUES ($1, $2, $3, $4, $5, 'N')
      RETURNING id
    `, [dtainicio, dtafinal, analista, dia_semana || null, observacao || null]);

    return NextResponse.json({
      success: true,
      id: result.rows[0].id,
      message: 'Plantão criado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao criar plantão:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    // Verificar autenticação
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const result = await queryIntranet(`
      SELECT * FROM plantao ORDER BY dtainicio DESC
    `);

    return NextResponse.json(result.rows);

  } catch (error) {
    console.error('Erro ao buscar plantões:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}