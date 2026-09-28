import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarBases } from '@/agents/core/db';

// Somente leitura: a base EMSys3 é criada/editada junto com o cliente (POST/PUT /api/agentes/clientes)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const bases = await listarBases(id, session.empresaId);
  return NextResponse.json(bases.map((b) => ({ ...b, db_senha: '••••••••' })));
}
