import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sanitizeText } from "@/lib/sanitize-text";
import type { SaasInstancia } from "@/types";

const updateSchema = z.object({
  nome_cliente: z.string().min(2).max(150).optional(),
  dominio: z.string().max(255).nullable().optional(),
  plano: z.string().max(20).optional(),
  status: z.enum(["ativo", "suspenso", "cancelado", "trial"]).optional(),
  obs: z.string().max(2000).nullable().optional(),
  gerar_token: z.boolean().optional(),
});

const SELECT_FIELDS = `id, slug, database_name, nome_cliente, dominio, plano, status,
                        token_api, obs, criado_em, atualizado_em`;

// GET /api/saas/instancias/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { id } = await params;
    const instancia = await queryOne<SaasInstancia>(
      `SELECT ${SELECT_FIELDS} FROM saas_instancias WHERE id = $1`,
      [id],
    );

    if (!instancia) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(instancia);
  } catch (err) {
    console.error("[GET /api/saas/instancias/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/saas/instancias/[id]
// Liga/desliga (status), edita dados cadastrais, e/ou gera um token novo (gerar_token: true)
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

    const { nome_cliente, dominio, plano, status, obs, gerar_token } = parsed.data;
    const sets: string[] = ["atualizado_em = NOW()"];
    const values: unknown[] = [];
    let idx = 1;

    if (nome_cliente !== undefined) { sets.push(`nome_cliente = $${idx++}`); values.push(sanitizeText(nome_cliente)); }
    if (dominio !== undefined) { sets.push(`dominio = $${idx++}`); values.push(dominio); }
    if (plano !== undefined) { sets.push(`plano = $${idx++}`); values.push(plano); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); values.push(status); }
    if (obs !== undefined) { sets.push(`obs = $${idx++}`); values.push(obs ? sanitizeText(obs) : null); }
    if (gerar_token) { sets.push(`token_api = $${idx++}`); values.push(randomBytes(32).toString("hex")); }

    values.push(id);
    const [instancia] = await query<SaasInstancia>(
      `UPDATE saas_instancias SET ${sets.join(", ")} WHERE id = $${idx}
       RETURNING ${SELECT_FIELDS}`,
      values,
    );

    if (!instancia) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    return NextResponse.json(instancia);
  } catch (err) {
    console.error("[PATCH /api/saas/instancias/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/saas/instancias/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { id } = await params;
    await query(`DELETE FROM saas_instancias WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/saas/instancias/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
