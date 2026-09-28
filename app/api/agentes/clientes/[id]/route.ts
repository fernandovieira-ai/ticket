import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  obterCliente, atualizarCliente, deletarCliente, listarBases, registrarVinculo, bancoEmUsoPorOutroCliente,
} from '@/agents/core/db';
import { descriptografar } from '@/agents/core/crypto';
import { validarVinculo } from '@/agents/core/vinculo';
import { z } from 'zod';

const schemaUpdate = z.object({
  nome:       z.string().min(2).max(100).optional(),
  slug:       z.string().min(2).max(50).regex(/^[a-z0-9][a-z0-9-_]*$/).optional(),
  db_host:    z.string().min(1).max(200).optional(),
  db_porta:   z.coerce.number().int().min(1).max(65535).optional(),
  db_nome:    z.string().min(1).max(100).optional(),
  db_usuario: z.string().min(1).max(100).optional(),
  db_senha:   z.string().min(1).optional(),
  db_schema:    z.string().max(50).optional(),
  query_erros:    z.string().max(5000).optional().nullable(),
  analise_painel: z.boolean().optional(),
  notas:          z.string().max(500).optional(),
  ativo:          z.boolean().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const cliente = await obterCliente(id, session.empresaId);
  if (!cliente) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });

  return NextResponse.json({ ...cliente, db_senha: '••••••••' });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Se a senha vier como mascara, nao atualiza
  if (body.db_senha === '••••••••') delete body.db_senha;

  const parsed = schemaUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const dados: typeof parsed.data & { query_erros?: string | null } = { ...parsed.data };
    if ('query_erros' in dados) {
      dados.query_erros = dados.query_erros?.trim() || null;
    }

    // Trocar a conexão da base AS exige revalidar o vínculo com a base EMSys3 ANTES de salvar
    const atual = await obterCliente(id, session.empresaId);
    if (!atual) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });

    const mudouConexao =
      (dados.db_host !== undefined && dados.db_host.trim().toLowerCase() !== atual.db_host.trim().toLowerCase()) ||
      (dados.db_porta !== undefined && dados.db_porta !== atual.db_porta) ||
      (dados.db_nome !== undefined && dados.db_nome.trim().toLowerCase() !== atual.db_nome.trim().toLowerCase()) ||
      (dados.db_usuario !== undefined && dados.db_usuario !== atual.db_usuario) ||
      (dados.db_schema !== undefined && dados.db_schema !== atual.db_schema) ||
      dados.db_senha !== undefined;

    let raizes: string[] | null = null;
    if (mudouConexao) {
      const emsys = (await listarBases(id, session.empresaId)).find((b) => b.papel === 'emsys');
      if (!emsys) {
        return NextResponse.json({
          error: 'Este cliente não tem base EMSys3 cadastrada. Cadastre a base EMSys3 (em "Bases") antes de alterar a conexão do AS.',
        }, { status: 409 });
      }
      const novoAS = {
        db_host: dados.db_host ?? atual.db_host,
        db_porta: dados.db_porta ?? atual.db_porta,
        db_nome: dados.db_nome ?? atual.db_nome,
        db_usuario: dados.db_usuario ?? atual.db_usuario,
        db_senha: dados.db_senha ?? descriptografar(atual.db_senha),
        db_schema: dados.db_schema ?? atual.db_schema,
      };
      const outro = await bancoEmUsoPorOutroCliente(session.empresaId, novoAS, id);
      if (outro) {
        return NextResponse.json({
          error: `O banco informado já está cadastrado no cliente "${outro}". Cada banco pertence a um único cliente.`,
        }, { status: 409 });
      }
      const vinculo = await validarVinculo(novoAS, { ...emsys, db_senha: descriptografar(emsys.db_senha) });
      if (!vinculo.ok) return NextResponse.json({ error: vinculo.mensagem, vinculo: false }, { status: 422 });
      raizes = vinculo.raizes ?? [];
    }

    const atualizado = await atualizarCliente(id, session.empresaId, dados);
    if (!atualizado) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });
    let final = atualizado;
    if (raizes) {
      await registrarVinculo(id, session.empresaId, { ok: true, cnpjs: raizes });
      final = (await obterCliente(id, session.empresaId)) ?? atualizado;
    }
    return NextResponse.json({ ...final, db_senha: '••••••••' });
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Slug ja existe' }, { status: 409 });
    }
    console.error('[agentes/clientes PUT]', err);
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const ok = await deletarCliente(id, session.empresaId);
  if (!ok) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });

  return NextResponse.json({ ok: true });
}
