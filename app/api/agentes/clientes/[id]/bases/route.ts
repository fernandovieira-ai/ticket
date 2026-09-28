import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  listarBases, criarBase, obterCliente, registrarVinculo, bancoEmUsoPorOutroCliente,
} from '@/agents/core/db';
import { descriptografar } from '@/agents/core/crypto';
import { validarVinculo, mesmaConexaoFisica } from '@/agents/core/vinculo';
import { z } from 'zod';

const schemaCreate = z.object({
  nome:        z.string().min(2).max(100),
  papel:       z.enum(['emsys', 'outro']).default('outro'),
  descricao:   z.string().max(300).optional().nullable(),
  db_host:     z.string().min(1).max(200),
  db_porta:    z.coerce.number().int().min(1).max(65535).default(5432),
  db_nome:     z.string().min(1).max(100),
  db_usuario:  z.string().min(1).max(100),
  db_senha:    z.string().min(1),
  db_schema:   z.string().max(50).default('public'),
  ativo:       z.boolean().default(true),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const bases = await listarBases(id, session.empresaId);
  return NextResponse.json(bases.map((b) => ({ ...b, db_senha: '••••••••' })));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const parsed = schemaCreate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    // O cliente precisa existir e pertencer à empresa da sessão
    const cliente = await obterCliente(id, session.empresaId);
    if (!cliente) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 });

    const outro = await bancoEmUsoPorOutroCliente(session.empresaId, parsed.data, id);
    if (outro) {
      return NextResponse.json({
        error: `Este banco já está cadastrado no cliente "${outro}". Cada banco pertence a um único cliente.`,
      }, { status: 409 });
    }
    if (mesmaConexaoFisica(parsed.data, cliente)) {
      return NextResponse.json({ error: 'Este banco é o mesmo da base AS (principal) do cliente.' }, { status: 409 });
    }

    let raizes: string[] | null = null;
    if (parsed.data.papel === 'emsys') {
      const jaTem = (await listarBases(id, session.empresaId)).some((b) => b.papel === 'emsys');
      if (jaTem) {
        return NextResponse.json({ error: 'Este cliente já tem uma base EMSys3. Edite a existente.' }, { status: 409 });
      }
      const vinculo = await validarVinculo(
        { ...cliente, db_senha: descriptografar(cliente.db_senha) },
        parsed.data,
      );
      if (!vinculo.ok) return NextResponse.json({ error: vinculo.mensagem, vinculo: false }, { status: 422 });
      raizes = vinculo.raizes ?? [];
    }

    const base = await criarBase(session.empresaId, {
      ...parsed.data,
      cliente_id: id,
      descricao:  parsed.data.descricao ?? null,
    });
    if (raizes) await registrarVinculo(id, session.empresaId, { ok: true, cnpjs: raizes });
    return NextResponse.json({ ...base, db_senha: '••••••••' }, { status: 201 });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Este cliente já tem uma base EMSys3.' }, { status: 409 });
    }
    console.error('[agentes/bases POST]', err);
    const detail = err?.message ?? 'Erro desconhecido';
    return NextResponse.json({ error: `Erro ao criar base: ${detail}` }, { status: 500 });
  }
}
