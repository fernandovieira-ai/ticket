import { NextRequest, NextResponse } from 'next/server';
import { queryIntranet } from '@/lib/db-unified';
import { getSession } from '@/lib/auth';

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Verificar autenticação
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { dtainicio, dtafinal, analista, dia_semana, observacao, ind_finalizado } = body;

    // Validar campos obrigatórios
    if (!dtainicio || !dtafinal || !analista) {
      return NextResponse.json(
        { error: 'Data início, data final e analista são obrigatórios' },
        { status: 400 }
      );
    }

    // Atualizar plantão
    const result = await queryIntranet(`
      UPDATE plantao
      SET dtainicio = $1, dtafinal = $2, analista = $3, dia_semana = $4, observacao = $5, ind_finalizado = $6
      WHERE id = $7
      RETURNING id
    `, [dtainicio, dtafinal, analista, dia_semana || null, observacao || null, ind_finalizado || 'N', id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Plantão não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Plantão atualizado com sucesso'
    });

  } catch (error) {
    console.error('Erro ao atualizar plantão:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // Verificar autenticação
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    // Deletar plantão
    const result = await queryIntranet(`
      DELETE FROM plantao WHERE id = $1 RETURNING id
    `, [id]);

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Plantão não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Plantão excluído com sucesso'
    });

  } catch (error) {
    console.error('Erro ao excluir plantão:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}