import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { query, queryOne } from "@/lib/db";
import { getSession } from "@/lib/auth";
import type { WhatsappContato } from "@/types";

const createSchema = z.object({
  numero: z.string().min(8).max(20).regex(/^\d+$/, "Apenas dígitos"),
  nome: z.string().max(150).optional().nullable(),
  id_departamentos: z.string().uuid().nullable().optional(),
  usuarios_id: z.string().uuid().nullable().optional(),
});

// GET /api/empresas/[id]/whatsapp-contatos
export async function GET(
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

    const contatos = await query<WhatsappContato>(
      `SELECT * FROM whatsapp_contatos WHERE empresa_id = $1 ORDER BY criado_em ASC`,
      [id],
    );

    return NextResponse.json(contatos);
  } catch (err) {
    console.error("[GET /api/empresas/[id]/whatsapp-contatos]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/empresas/[id]/whatsapp-contatos
export async function POST(
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

    const parsed = createSchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: "Dados inválidos", detalhes: parsed.error.flatten() },
        { status: 400 },
      );

    const { numero, nome, id_departamentos, usuarios_id } = parsed.data;

    const contato = await queryOne<WhatsappContato>(
      `INSERT INTO whatsapp_contatos (empresa_id, numero, nome, id_departamentos, usuarios_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, numero, nome ?? null, id_departamentos ?? null, usuarios_id ?? null],
    );

    return NextResponse.json(contato, { status: 201 });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as { code: string }).code === "23505"
    ) {
      return NextResponse.json(
        { error: "Número já cadastrado para esta empresa" },
        { status: 409 },
      );
    }
    console.error("[POST /api/empresas/[id]/whatsapp-contatos]", err);
    const msg = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
