import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarBases } from '@/agents/core/db';
import { descriptografar } from '@/agents/core/crypto';
import pg from 'pg';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; baseId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id, baseId } = await params;
  const bases = await listarBases(id, session.empresaId);
  const base = bases.find((b) => b.id === baseId);
  if (!base) return NextResponse.json({ error: 'Base nao encontrada' }, { status: 404 });

  const client = new pg.Client({
    host:     base.db_host,
    port:     base.db_porta,
    database: base.db_nome,
    user:     base.db_usuario,
    password: descriptografar(base.db_senha),
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
    return NextResponse.json({ ok: false, erro: err?.message ?? 'Falha na conexao' });
  }
}
