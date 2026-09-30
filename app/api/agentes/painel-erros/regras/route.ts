import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarRegrasPainelCompleto, upsertRegraPainel, resetarRegraPainel } from '@/agents/core/regras-painel';
import { z } from 'zod';

// Regras de ação por tipo de erro do Painel de Erros — dado, editável aqui, não fixo no código
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const regras = await listarRegrasPainelCompleto(session.empresaId);
  return NextResponse.json({ regras });
}

const putSchema = z.object({
  categoria: z.string().min(1).max(300),
  modo: z.enum(['somente_reprocessar', 'ajustar_pagamento', 'elegivel_automatico', 'assistido', 'manual']),
  titulo: z.string().max(120),
  descricao: z.string().max(1000),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  await upsertRegraPainel(session.empresaId, parsed.data.categoria, {
    modo: parsed.data.modo, titulo: parsed.data.titulo, descricao: parsed.data.descricao,
  });
  return NextResponse.json({ ok: true });
}

const deleteSchema = z.object({ categoria: z.string().min(1).max(300) });

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  await resetarRegraPainel(session.empresaId, parsed.data.categoria);
  return NextResponse.json({ ok: true });
}
