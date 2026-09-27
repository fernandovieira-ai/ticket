import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarPropostas } from '@/agents/core/db';

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const propostas = await listarPropostas(session.empresaId);
    return NextResponse.json(propostas);
  } catch (err) {
    console.error('[agentes/propostas GET]', err);
    return NextResponse.json({ error: 'Erro ao buscar propostas' }, { status: 500 });
  }
}
