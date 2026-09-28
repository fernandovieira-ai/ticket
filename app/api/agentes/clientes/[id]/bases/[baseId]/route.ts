import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  atualizarBase, deletarBase, obterBase, obterCliente, registrarVinculo, bancoEmUsoPorOutroCliente,
} from '@/agents/core/db';
import { descriptografar } from '@/agents/core/crypto';
import { validarVinculo, mesmaConexaoFisica } from '@/agents/core/vinculo';
import { z } from 'zod';

const schemaUpdate = z.object({
  nome:       z.string().min(2).max(100).optional(),
  descricao:  z.string().max(300).optional().nullable(),
  db_host:    z.string().min(1).max(200).optional(),
  db_porta:   z.coerce.number().int().min(1).max(65535).optional(),
  db_nome:    z.string().min(1).max(100).optional(),
  db_usuario: z.string().min(1).max(100).optional(),
  db_senha:   z.string().min(1).optional(),
  db_schema:  z.string().max(50).optional(),
  ativo:      z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; baseId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id, baseId } = await params;
  const body = await req.json();

  if (body.db_senha === '••••••••') delete body.db_senha;

  const parsed = schemaUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const d = parsed.data;

  try {
    // A base precisa pertencer ao cliente da URL (e à empresa da sessão)
    const atual = await obterBase(baseId, session.empresaId);
    if (!atual || atual.cliente_id !== id) return NextResponse.json({ error: 'Nao encontrada' }, { status: 404 });

    let raizes: string[] | null = null;
    const mudouConexao =
      (d.db_host !== undefined && d.db_host.trim().toLowerCase() !== atual.db_host.trim().toLowerCase()) ||
      (d.db_porta !== undefined && d.db_porta !== atual.db_porta) ||
      (d.db_nome !== undefined && d.db_nome.trim().toLowerCase() !== atual.db_nome.trim().toLowerCase()) ||
      (d.db_usuario !== undefined && d.db_usuario !== atual.db_usuario) ||
      (d.db_schema !== undefined && d.db_schema !== atual.db_schema) ||
      d.db_senha !== undefined;

    if (atual.papel === 'emsys' && d.ativo === false) {
      return NextResponse.json({ error: 'A base EMSys3 é obrigatória e não pode ser desativada.' }, { status: 409 });
    }

    if (mudouConexao) {
      const cliente = await obterCliente(id, session.empresaId);
      if (!cliente) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 });

      const nova = {
        db_host: d.db_host ?? atual.db_host,
        db_porta: d.db_porta ?? atual.db_porta,
        db_nome: d.db_nome ?? atual.db_nome,
        db_usuario: d.db_usuario ?? atual.db_usuario,
        db_senha: d.db_senha ?? descriptografar(atual.db_senha),
        db_schema: d.db_schema ?? atual.db_schema,
      };
      const outro = await bancoEmUsoPorOutroCliente(session.empresaId, nova, id);
      if (outro) {
        return NextResponse.json({
          error: `Este banco já está cadastrado no cliente "${outro}". Cada banco pertence a um único cliente.`,
        }, { status: 409 });
      }
      if (mesmaConexaoFisica(nova, cliente)) {
        return NextResponse.json({ error: 'Este banco é o mesmo da base AS (principal) do cliente.' }, { status: 409 });
      }
      if (atual.papel === 'emsys') {
        const vinculo = await validarVinculo({ ...cliente, db_senha: descriptografar(cliente.db_senha) }, nova);
        if (!vinculo.ok) return NextResponse.json({ error: vinculo.mensagem, vinculo: false }, { status: 422 });
        raizes = vinculo.raizes ?? [];
      }
    }

    const base = await atualizarBase(baseId, session.empresaId, d);
    if (!base) return NextResponse.json({ error: 'Nao encontrada' }, { status: 404 });
    if (raizes) await registrarVinculo(id, session.empresaId, { ok: true, cnpjs: raizes });
    return NextResponse.json({ ...base, db_senha: '••••••••' });
  } catch (err) {
    console.error('[agentes/bases PUT]', err);
    return NextResponse.json({ error: 'Erro ao atualizar base' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; baseId: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id, baseId } = await params;
  const atual = await obterBase(baseId, session.empresaId);
  if (!atual || atual.cliente_id !== id) return NextResponse.json({ error: 'Nao encontrada' }, { status: 404 });
  if (atual.papel === 'emsys') {
    return NextResponse.json({
      error: 'A base EMSys3 é obrigatória e não pode ser removida. Para trocar, edite os dados dela (o vínculo com o AS será revalidado).',
    }, { status: 409 });
  }

  const ok = await deletarBase(baseId, session.empresaId);
  if (!ok) return NextResponse.json({ error: 'Nao encontrada' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
