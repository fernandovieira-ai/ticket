import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarPadroesCliente, limparPadraoCliente, LABEL_PADRAO_CLIENTE } from '@/agents/core/padroes-cliente';
import { z } from 'zod';

// Lista todos os padrões salvos (tipo de movimento, forma de pagamento, ...) de uma base — tela única de
// configuração por cliente, em vez de espalhar isso pelos ajustes individuais.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const cliente_id = req.nextUrl.searchParams.get('cliente_id') ?? '';
  if (!z.string().uuid().safeParse(cliente_id).success) return NextResponse.json({ error: 'cliente_id inválido' }, { status: 400 });

  const salvos = await listarPadroesCliente(session.empresaId, cliente_id);
  const padroes = Object.entries(LABEL_PADRAO_CLIENTE).map(([chave, meta]) => {
    const valor = salvos[chave];
    return {
      chave,
      titulo: meta.titulo,
      definido: valor !== undefined,
      descricao: valor !== undefined ? meta.descricaoDoValor(valor) : null,
    };
  });
  return NextResponse.json({ padroes });
}

const deleteSchema = z.object({ cliente_id: z.string().uuid(), chave: z.string().min(1).max(100) });

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });

  await limparPadraoCliente(session.empresaId, parsed.data.cliente_id, parsed.data.chave);
  return NextResponse.json({ ok: true });
}
