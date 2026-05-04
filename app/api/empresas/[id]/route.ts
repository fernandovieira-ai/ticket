import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { Empresa } from "@/types";

const updateSchema = z.object({
  nome: z.string().min(2).max(200).optional(),
  dominio: z.string().max(100).nullable().optional(),
  logo_url: z.string().max(2000).nullable().optional(),
  fuso_horario: z.string().max(50).optional(),
  idioma: z.string().max(10).optional(),
  prefixo_ticket: z.string().min(1).max(10).optional(),
  ativo: z.boolean().optional(),
});

// PATCH /api/empresas/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin")
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const parsed = updateSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Dados inválidos", detalhes: parsed.error.flatten() },
        { status: 400 },
      );

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
      return NextResponse.json(
        { error: "Nada para atualizar" },
        { status: 400 },
      );

    values.push(id);
    const empresa = await queryOne<Empresa>(
      `UPDATE empresas SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );

    if (!empresa)
      return NextResponse.json(
        { error: "Empresa não encontrada" },
        { status: 404 },
      );

    return NextResponse.json(empresa);
  } catch (err) {
    console.error("[PATCH /api/empresas/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// DELETE /api/empresas/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    if (session.perfil !== "admin")
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

    const { id } = await params;

    const deleted = await query<Empresa>(
      `DELETE FROM empresas WHERE id = $1 RETURNING id`,
      [id],
    );

    if (deleted.length === 0)
      return NextResponse.json(
        { error: "Empresa não encontrada" },
        { status: 404 },
      );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/empresas/[id]]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
