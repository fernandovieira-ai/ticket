import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { obterCliente, listarBases } from '@/agents/core/db';
import { descriptografar } from '@/agents/core/crypto';
import { z } from 'zod';
import pg from 'pg';

const MASCARA = '••••••••';

const schema = z.object({
  db_host:    z.string().min(1),
  db_porta:   z.coerce.number().int().min(1).max(65535).default(5432),
  db_nome:    z.string().min(1),
  db_usuario: z.string().min(1),
  db_senha:   z.string().optional(),
  db_schema:  z.string().max(50).optional(),
  // Qual base está sendo testada: confere se o banco tem as tabelas típicas dela
  esperado:   z.enum(['as', 'emsys']).optional(),
  // Em edição, senha em branco/mascarada usa a já salva desse cliente
  cliente_id: z.string().uuid().optional(),
});

// Tabela que identifica cada sistema (o CNPJ é lido delas na validação do vínculo)
const TABELA_ASSINATURA = { as: 'empresa', emsys: 'tab_empresa' } as const;
const NOME_SISTEMA = { as: 'AS', emsys: 'EMSys3' } as const;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const { db_host, db_porta, db_nome, db_usuario, db_schema, esperado, cliente_id } = parsed.data;

  let senha = parsed.data.db_senha && parsed.data.db_senha !== MASCARA ? parsed.data.db_senha : '';
  if (!senha && cliente_id && esperado) {
    const cliente = await obterCliente(cliente_id, session.empresaId);
    if (cliente) {
      if (esperado === 'as') senha = descriptografar(cliente.db_senha);
      else {
        const base = (await listarBases(cliente_id, session.empresaId)).find((b) => b.papel === 'emsys');
        if (base) senha = descriptografar(base.db_senha);
      }
    }
  }
  if (!senha) return NextResponse.json({ ok: false, erro: 'Informe a senha para testar.' });

  const client = new pg.Client({
    host:     db_host,
    port:     db_porta,
    database: db_nome,
    user:     db_usuario,
    password: senha,
    connectionTimeoutMillis: 5000,
    ssl: false,
    options: '-c default_transaction_read_only=on',
  });

  try {
    await client.connect();
    const { rows } = await client.query('SELECT current_database() AS db, version() AS ver');
    const versao = (rows[0].ver as string).split(' ').slice(0, 2).join(' ');

    let aviso: string | undefined;
    if (esperado) {
      const schemaNome = db_schema || 'public';
      const tabela = TABELA_ASSINATURA[esperado];
      const t = await client.query(`SELECT to_regclass($1) AS existe`, [`"${schemaNome.replace(/"/g, '""')}"."${tabela}"`]);
      if (!t.rows[0]?.existe) {
        await client.end();
        return NextResponse.json({
          ok: false,
          erro: `Conectou em "${rows[0].db}", mas não parece ser um banco ${NOME_SISTEMA[esperado]}: a tabela "${tabela}" não existe no schema "${schemaNome}". Confira o banco informado.`,
        });
      }
      aviso = `tabela ${tabela} encontrada`;
    }

    await client.end();
    return NextResponse.json({ ok: true, banco: rows[0].db, versao, aviso });
  } catch (err: any) {
    await client.end().catch(() => {});
    return NextResponse.json({ ok: false, erro: err?.message ?? 'Falha na conexao' });
  }
}
