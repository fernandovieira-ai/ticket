import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { z } from 'zod';
import pg from 'pg';

const schema = z.object({
  db_host:    z.string().min(1),
  db_porta:   z.coerce.number().int().min(1).max(65535).default(5432),
  db_nome:    z.string().min(1),
  db_usuario: z.string().min(1),
  db_senha:   z.string().min(1),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { db_host, db_porta, db_nome, db_usuario, db_senha } = parsed.data;

  const client = new pg.Client({
    host:     db_host,
    port:     db_porta,
    database: db_nome,
    user:     db_usuario,
    password: db_senha,
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
