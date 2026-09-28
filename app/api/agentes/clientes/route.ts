import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { listarClientes, criarClienteComBase, bancoEmUsoPorOutroCliente } from '@/agents/core/db';
import { validarVinculo, mesmaConexaoFisica } from '@/agents/core/vinculo';
import { z } from 'zod';

// Base EMSys3: obrigatória no cadastro — o cliente só é salvo junto com ela e com o vínculo validado
const schemaEmsys = z.object({
  nome:       z.string().min(2).max(100).default('EMSys3'),
  descricao:  z.string().max(300).optional().nullable(),
  db_host:    z.string().min(1).max(200),
  db_porta:   z.coerce.number().int().min(1).max(65535).default(5432),
  db_nome:    z.string().min(1).max(100),
  db_usuario: z.string().min(1).max(100),
  db_senha:   z.string().min(1, 'Informe a senha da base EMSys3'),
  db_schema:  z.string().max(50).default('public'),
});

const schemaCreate = z.object({
  emsys:        schemaEmsys,
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
    const { emsys, ...clienteDados } = parsed.data;

    if (mesmaConexaoFisica(clienteDados, emsys)) {
      return NextResponse.json({
        error: 'A base AS e a base EMSys3 apontam para o mesmo banco (host, porta e nome iguais). Informe o banco correto do EMSys3.',
      }, { status: 422 });
    }
    for (const [rotulo, cfg] of [['AS', clienteDados], ['EMSys3', emsys]] as const) {
      const outro = await bancoEmUsoPorOutroCliente(session.empresaId, cfg);
      if (outro) {
        return NextResponse.json({
          error: `O banco informado para ${rotulo} (${cfg.db_host}:${cfg.db_porta}/${cfg.db_nome}) já está cadastrado no cliente "${outro}". Cada banco pertence a um único cliente.`,
        }, { status: 409 });
      }
    }

    const vinculo = await validarVinculo(clienteDados, emsys);
    if (!vinculo.ok) {
      return NextResponse.json({ error: vinculo.mensagem, vinculo: false }, { status: 422 });
    }

    const dados = {
      ...clienteDados,
      query_erros: clienteDados.query_erros?.trim() || null,
      notas:       clienteDados.notas ?? null,
    };
    const { cliente, base } = await criarClienteComBase(
      session.empresaId, dados,
      { ...emsys, descricao: emsys.descricao ?? null },
      vinculo.raizes ?? [],
    );
    return NextResponse.json(
      { ...cliente, db_senha: '••••••••', base: { ...base, db_senha: '••••••••' }, vinculo_mensagem: vinculo.mensagem },
      { status: 201 },
    );
  } catch (err: any) {
    if (err?.code === '23505') {
      return NextResponse.json({ error: 'Slug ja existe para este cliente' }, { status: 409 });
    }
    console.error('[agentes/clientes POST]', err);
    return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 });
  }
}
