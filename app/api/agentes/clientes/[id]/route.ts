import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  obterCliente, deletarCliente, listarBases, registrarVinculo, bancoEmUsoPorOutroCliente, salvarClienteEBase,
} from '@/agents/core/db';
import { descriptografar } from '@/agents/core/crypto';
import { validarVinculo, mesmaConexaoFisica } from '@/agents/core/vinculo';
import { z } from 'zod';

const schemaEmsysUpdate = z.object({
  nome:       z.string().min(2).max(100).optional(),
  db_host:    z.string().min(1).max(200).optional(),
  db_porta:   z.coerce.number().int().min(1).max(65535).optional(),
  db_nome:    z.string().min(1).max(100).optional(),
  db_usuario: z.string().min(1).max(100).optional(),
  db_senha:   z.string().min(1).optional(),
  db_schema:  z.string().max(50).optional(),
});

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
  // Base EMSys3 salva junto com o cliente (uma única ação, uma única validação de CNPJ)
  emsys:          schemaEmsysUpdate.optional(),
});

const MASCARA = '••••••••';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const cliente = await obterCliente(id, session.empresaId);
  if (!cliente) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });

  return NextResponse.json({ ...cliente, db_senha: MASCARA });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Se a senha vier como mascara, nao atualiza
  if (body.db_senha === MASCARA) delete body.db_senha;
  if (body.emsys?.db_senha === MASCARA) delete body.emsys.db_senha;

  const parsed = schemaUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  try {
    const { emsys: emsysPatch, ...dados } = parsed.data as typeof parsed.data & { query_erros?: string | null };
    if ('query_erros' in dados) {
      dados.query_erros = dados.query_erros?.trim() || null;
    }

    const atual = await obterCliente(id, session.empresaId);
    if (!atual) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });
    const emsysAtual = (await listarBases(id, session.empresaId)).find((b) => b.papel === 'emsys');

    // Conexão do AS depois da alteração
    const mudouAS =
      (dados.db_host !== undefined && dados.db_host.trim().toLowerCase() !== atual.db_host.trim().toLowerCase()) ||
      (dados.db_porta !== undefined && dados.db_porta !== atual.db_porta) ||
      (dados.db_nome !== undefined && dados.db_nome.trim().toLowerCase() !== atual.db_nome.trim().toLowerCase()) ||
      (dados.db_usuario !== undefined && dados.db_usuario !== atual.db_usuario) ||
      (dados.db_schema !== undefined && dados.db_schema !== atual.db_schema) ||
      dados.db_senha !== undefined;
    const novoAS = {
      db_host: dados.db_host ?? atual.db_host,
      db_porta: dados.db_porta ?? atual.db_porta,
      db_nome: dados.db_nome ?? atual.db_nome,
      db_usuario: dados.db_usuario ?? atual.db_usuario,
      db_senha: dados.db_senha ?? descriptografar(atual.db_senha),
      db_schema: dados.db_schema ?? atual.db_schema,
    };

    // Conexão do EMSys3 depois da alteração (mescla o que veio por cima do que já está salvo)
    let novoEm: typeof novoAS | null = null;
    let mudouEm = false;
    if (emsysAtual) {
      const p = emsysPatch ?? {};
      mudouEm =
        (p.db_host !== undefined && p.db_host.trim().toLowerCase() !== emsysAtual.db_host.trim().toLowerCase()) ||
        (p.db_porta !== undefined && p.db_porta !== emsysAtual.db_porta) ||
        (p.db_nome !== undefined && p.db_nome.trim().toLowerCase() !== emsysAtual.db_nome.trim().toLowerCase()) ||
        (p.db_usuario !== undefined && p.db_usuario !== emsysAtual.db_usuario) ||
        (p.db_schema !== undefined && p.db_schema !== emsysAtual.db_schema) ||
        p.db_senha !== undefined;
      novoEm = {
        db_host: p.db_host ?? emsysAtual.db_host,
        db_porta: p.db_porta ?? emsysAtual.db_porta,
        db_nome: p.db_nome ?? emsysAtual.db_nome,
        db_usuario: p.db_usuario ?? emsysAtual.db_usuario,
        db_senha: p.db_senha ?? descriptografar(emsysAtual.db_senha),
        db_schema: p.db_schema ?? emsysAtual.db_schema,
      };
    } else {
      // Cadastro antigo sem base EMSys3: agora é obrigatório informar
      const p = emsysPatch;
      if (!p?.db_host || !p.db_nome || !p.db_usuario || !p.db_senha) {
        return NextResponse.json({
          error: 'Este cliente ainda não tem a base EMSys3. Preencha host, banco, usuário e senha do EMSys3 para salvar.',
        }, { status: 409 });
      }
      novoEm = {
        db_host: p.db_host, db_porta: p.db_porta ?? 5432, db_nome: p.db_nome,
        db_usuario: p.db_usuario, db_senha: p.db_senha, db_schema: p.db_schema ?? 'public',
      };
      mudouEm = true;
    }

    let raizes: string[] | null = null;
    if (mudouAS || mudouEm) {
      if (mesmaConexaoFisica(novoAS, novoEm)) {
        return NextResponse.json({
          error: 'A base AS e a base EMSys3 apontam para o mesmo banco (host, porta e nome iguais). Informe o banco correto do EMSys3.',
        }, { status: 422 });
      }
      for (const [rotulo, cfg] of [['AS', novoAS], ['EMSys3', novoEm]] as const) {
        const outro = await bancoEmUsoPorOutroCliente(session.empresaId, cfg, id);
        if (outro) {
          return NextResponse.json({
            error: `O banco informado para ${rotulo} já está cadastrado no cliente "${outro}". Cada banco pertence a um único cliente.`,
          }, { status: 409 });
        }
      }
      const vinculo = await validarVinculo(novoAS, novoEm);
      if (!vinculo.ok) return NextResponse.json({ error: vinculo.mensagem, vinculo: false }, { status: 422 });
      raizes = vinculo.raizes ?? [];
    }

    const { cliente: atualizado } = await salvarClienteEBase(
      session.empresaId, id, dados,
      { baseId: emsysAtual?.id ?? null, dados: emsysAtual ? { ...(emsysPatch ?? {}) } : { ...novoEm!, nome: emsysPatch?.nome ?? 'EMSys3' } },
    );
    if (!atualizado) return NextResponse.json({ error: 'Nao encontrado' }, { status: 404 });

    let final = atualizado;
    if (raizes) {
      await registrarVinculo(id, session.empresaId, { ok: true, cnpjs: raizes });
      final = (await obterCliente(id, session.empresaId)) ?? atualizado;
    }
    return NextResponse.json({ ...final, db_senha: MASCARA });
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
