import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarClientes, criarCliente } from '@/agents/core/db';
import { z } from 'zod';

const schemaCreate = z.object({
  nome:         z.string().min(2).max(100),
  slug:         z.string().min(2).max(50).regex(/^[a-z0-9][a-z0-9-_]*$/, 'Slug: letras minusculas, numeros e hifens'),
  db_host:      z.string().min(1).max(200),
  db_porta:     z.coerce.number().int().min(1).max(65535).default(5432),
  db_nome:      z.string().min(1).max(100),
  db_usuario:   z.string().min(1).max(100),
  db_senha:     z.string().min(1),
  db_schema:    z.string().max(50).default('public'),
  query_erros:    z.string().max(5000).optional().nullable(),
  analise_painel: z.boolean().default(false),
  notas:          z.string().max(500).optional(),
  ativo:          z.boolean().default(true),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const clientes = await listarClientes(session.empresaId);
  // mascara a senha antes de retornar
  const publico = clientes.map((c) => ({ ...c, db_senha: '••••••••' }));
  return NextResponse.json(publico);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const body = await req.json();
  const parsed = schemaCreate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const dados = {
      ...parsed.data,
      query_erros: parsed.data.query_erros?.trim() || null,
      notas:       parsed.data.notas ?? null,
    };
    const cliente = await criarCliente(session.empresaId, dados);
    return NextResponse.json({ ...cliente, db_senha: '••••••••' }, { status: 201 });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Slug ja existe para este cliente' }, { status: 409 });
    }
    console.error('[agentes/clientes POST]', err);
    return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 });
  }
}
