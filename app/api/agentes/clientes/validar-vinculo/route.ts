import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { obterCliente, listarBases } from '@/agents/core/db';
import { descriptografar } from '@/agents/core/crypto';
import { validarVinculo } from '@/agents/core/vinculo';
import { z } from 'zod';

const MASCARA = '••••••••';

const conexao = z.object({
  db_host:    z.string().min(1).max(200),
  db_porta:   z.coerce.number().int().min(1).max(65535).default(5432),
  db_nome:    z.string().min(1).max(100),
  db_usuario: z.string().min(1).max(100),
  db_senha:   z.string().optional(),
  db_schema:  z.string().max(50).default('public'),
});

const schema = z.object({
  cliente_id: z.string().uuid().optional(),
  as:         conexao,
  emsys:      conexao,
});

// Valida (sem gravar nada) se a base AS e a base EMSys3 informadas são da mesma empresa.
// Com cliente_id, senhas em branco/mascaradas usam as já cadastradas.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { cliente_id, as, emsys } = parsed.data;

  let senhaAS = as.db_senha && as.db_senha !== MASCARA ? as.db_senha : '';
  let senhaEm = emsys.db_senha && emsys.db_senha !== MASCARA ? emsys.db_senha : '';

  if (cliente_id && (!senhaAS || !senhaEm)) {
    const cliente = await obterCliente(cliente_id, session.empresaId);
    if (!cliente) return NextResponse.json({ error: 'Cliente nao encontrado' }, { status: 404 });
    if (!senhaAS) senhaAS = descriptografar(cliente.db_senha);
    if (!senhaEm) {
      const base = (await listarBases(cliente_id, session.empresaId)).find((b) => b.papel === 'emsys');
      if (base) senhaEm = descriptografar(base.db_senha);
    }
  }
  if (!senhaAS) return NextResponse.json({ ok: false, mensagem: 'Informe a senha da base AS.' });
  if (!senhaEm) return NextResponse.json({ ok: false, mensagem: 'Informe a senha da base EMSys3.' });

  const r = await validarVinculo({ ...as, db_senha: senhaAS }, { ...emsys, db_senha: senhaEm });
  return NextResponse.json({ ok: r.ok, mensagem: r.mensagem });
}
