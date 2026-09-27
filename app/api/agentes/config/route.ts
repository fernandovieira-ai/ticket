import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { obterConfig, upsertConfig } from '@/agents/core/db';
import { z } from 'zod';

const schemaPut = z.object({
  ativo: z.boolean(),
  auto_aprovar_tipos: z.array(
    z.enum(['configuracao', 'dados', 'codigo', 'infraestrutura', 'outro']),
  ),
  notificar_email: z.boolean(),
  notificar_whatsapp: z.boolean(),
});

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  try {
    const config = await obterConfig(session.empresaId);
    return NextResponse.json(
      config ?? {
        ativo: false,
        auto_aprovar_tipos: [],
        notificar_email: false,
        notificar_whatsapp: false,
      },
    );
  } catch (err) {
    console.error('[agentes/config GET]', err);
    return NextResponse.json({ error: 'Erro ao buscar configuração' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const body = await req.json();
  const parsed = schemaPut.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const config = await upsertConfig(session.empresaId, parsed.data);
    return NextResponse.json(config);
  } catch (err) {
    console.error('[agentes/config PUT]', err);
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 });
  }
}
