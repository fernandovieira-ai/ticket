import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Cliente, ContatoCliente } from "@/types";

const updateSchema = z.object({
  nome_razao: z.string().min(2).max(200).optional(),
  tipo: z.enum(["J", "F"]).optional(),
  documento: z.string().max(20).nullable().optional(),
  email: z.string().email().max(200).nullable().optional(),
  telefone: z.string().max(30).nullable().optional(),
  segmento: z.string().max(100).nullable().optional(),
  observacoes: z.string().nullable().optional(),
  cep: z.string().max(10).nullable().optional(),
  logradouro: z.string().max(150).nullable().optional(),
  numero: z.string().max(20).nullable().optional(),
  complemento: z.string().max(60).nullable().optional(),
  bairro: z.string().max(80).nullable().optional(),
  cidade: z.string().max(80).nullable().optional(),
  uf: z.string().max(2).nullable().optional(),
  ativo: z.boolean().optional(),
  ind_pre_cadastro: z.boolean().optional(),
});

// GET /api/clientes/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;
  const cliente = await queryOne<Cliente>(
    `SELECT * FROM clientes WHERE id = $1 AND empresa_id = $2`,
    [id, session.empresaId],
  );
  if (!cliente)
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const contatos = await query<ContatoCliente>(
    `SELECT * FROM contatos_cliente WHERE cliente_id = $1 ORDER BY principal DESC, nome`,
    [id],
  );

  return NextResponse.json({ ...cliente, contatos });
}

// PATCH /api/clientes/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const fields = parsed.data;
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(fields)) {
    if (val !== undefined) {
      sets.push(`${key} = $${idx++}`);
      values.push(val);
    }
  }

  if (sets.length === 0)
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });

  values.push(id, session.empresaId);
  const [cliente] = await query<Cliente>(
    `UPDATE clientes SET ${sets.join(", ")} WHERE id = $${idx} AND empresa_id = $${idx + 1} RETURNING *`,
    values,
  );

  if (!cliente)
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  return NextResponse.json(cliente);
}

// DELETE /api/clientes/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const { id } = await params;

    const [deleted] = await query<{ id: string }>(
      `DELETE FROM clientes WHERE id = $1 AND empresa_id = $2 RETURNING id`,
      [id, session.empresaId],
    );

    if (!deleted)
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/clientes/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
