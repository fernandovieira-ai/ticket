import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sanitizeText } from "@/lib/sanitize-text";
import type { RemoteAssistLicenca } from "@/types";

const updateSchema = z.object({
  nome_cliente: z.string().min(2).max(150).nullable().optional(),
  status: z.enum(["pendente", "ativo", "suspenso", "cancelado"]).optional(),
  vencimento: z.string().date().nullable().optional(),
  obs: z.string().max(2000).nullable().optional(),
});

const SELECT_FIELDS = `id, device_id, nome_cliente, status, vencimento::text AS vencimento, obs,
                        ultimo_contato_em, criado_em, atualizado_em`;

// GET /api/remoteassist/licencas/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { id } = await params;
    const licenca = await queryOne<RemoteAssistLicenca>(
      `SELECT ${SELECT_FIELDS} FROM remoteassist_licencas WHERE id = $1`,
      [id],
    );

    if (!licenca) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(licenca);
  } catch (err) {
    console.error("[GET /api/remoteassist/licencas/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/remoteassist/licencas/[id] — liberar/suspender, editar dados, mudar vencimento
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const { nome_cliente, status, vencimento, obs } = parsed.data;
    const sets: string[] = ["atualizado_em = NOW()"];
    const values: unknown[] = [];
    let idx = 1;

    if (nome_cliente !== undefined) { sets.push(`nome_cliente = $${idx++}`); values.push(nome_cliente ? sanitizeText(nome_cliente) : null); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); values.push(status); }
    if (vencimento !== undefined) { sets.push(`vencimento = $${idx++}`); values.push(vencimento); }
    if (obs !== undefined) { sets.push(`obs = $${idx++}`); values.push(obs ? sanitizeText(obs) : null); }

    values.push(id);
    const [licenca] = await query<RemoteAssistLicenca>(
      `UPDATE remoteassist_licencas SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING ${SELECT_FIELDS}`,
      values,
    );

    if (!licenca) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(licenca);
  } catch (err) {
    console.error("[PATCH /api/remoteassist/licencas/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/remoteassist/licencas/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { id } = await params;
    await query(`DELETE FROM remoteassist_licencas WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/remoteassist/licencas/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
