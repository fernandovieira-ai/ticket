import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { obterCliente } from '@/agents/core/db';
import { garantirVinculo } from '@/agents/core/vinculo';

// Revalida o vínculo AS x EMSys3 de um cliente JÁ cadastrado, com as credenciais salvas,
// e registra o resultado no cadastro.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const existe = await obterCliente(id, session.empresaId);
  if (!existe) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });

  const r = await garantirVinculo(id, session.empresaId, true);
  const atual = await obterCliente(id, session.empresaId);
  return NextResponse.json({
    ok: r.ok,
    mensagem: r.ok ? `Vínculo validado (CNPJ raiz ${atual?.vinculo_cnpjs ?? ''}).` : r.erro,
    vinculo_validado_em: atual?.vinculo_validado_em ?? null,
    vinculo_cnpjs: atual?.vinculo_cnpjs ?? null,
    vinculo_erro: atual?.vinculo_erro ?? null,
  });
}
