import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { obterCliente } from '@/agents/core/db';
import pg from 'pg';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const cliente = await obterCliente(id, session.empresaId);
  if (!cliente) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 });

  const client = new pg.Client({
    host:     cliente.db_host,
    port:     cliente.db_porta,
    database: cliente.db_nome,
    user:     cliente.db_usuario,
    password: cliente.db_senha,
    connectionTimeoutMillis: 5000,
    ssl: false,
  });

  try {
    await client.connect();
    const { rows } = await client.query('SELECT current_database() AS db, version() AS ver');
    await client.end();
    return NextResponse.json({
      ok: true,
      banco: rows[0].db,
      versao: (rows[0].ver as string).split(' ').slice(0, 2).join(' '),
    });
  } catch (err: any) {
    await client.end().catch(() => {});
    return NextResponse.json({
      ok: false,
      erro: err?.message ?? 'Falha na conexao',
    }, { status: 200 }); // 200 para o front poder ler o erro
  }
}
