import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, signAccessToken } from "@/lib/auth";
import { queryOne } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const usuario = await queryOne<{
    nome: string;
    email: string;
    avatar_url: string | null;
    telefone: string | null;
  }>("SELECT nome, email, avatar_url, telefone FROM usuarios WHERE id = $1", [
    session.sub,
  ]);

  return NextResponse.json({
    sub: session.sub,
    perfil: session.perfil,
    nome: usuario?.nome ?? session.nome,
    email: usuario?.email ?? session.email,
    avatar_url: usuario?.avatar_url ?? null,
    telefone: usuario?.telefone ?? null,
  });
}

const updateSchema = z.object({
  nome: z.string().min(2).max(150).optional(),
  avatar_url: z.string().max(500).nullable().optional(),
  telefone: z.string().max(30).nullable().optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { nome, avatar_url, telefone } = parsed.data;
  const sets: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (nome !== undefined) {
    sets.push(`nome = $${idx++}`);
    values.push(nome);
  }
  if (avatar_url !== undefined) {
    sets.push(`avatar_url = $${idx++}`);
    values.push(avatar_url);
  }
  if (telefone !== undefined) {
    sets.push(`telefone = $${idx++}`);
    values.push(telefone);
  }

  if (sets.length === 0)
    return NextResponse.json({ error: "Nada para atualizar" }, { status: 400 });

  values.push(session.sub);
  const updated = await queryOne<{
    nome: string;
    email: string;
    avatar_url: string | null;
    telefone: string | null;
  }>(
    `UPDATE usuarios SET ${sets.join(", ")} WHERE id = $${idx}
     RETURNING nome, email, avatar_url, telefone`,
    values,
  );

  if (!updated)
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 404 },
    );

  // Re-emite access token com nome atualizado
  const newAccessToken = await signAccessToken({
    sub: session.sub,
    empresaId: session.empresaId,
    perfil: session.perfil,
    nome: updated.nome,
    email: updated.email,
  });

  const response = NextResponse.json({ success: true, ...updated });
  response.cookies.set("access_token", newAccessToken, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: 7200, // 2 hours - should match JWT_EXPIRES_IN
  });
  return response;
}
