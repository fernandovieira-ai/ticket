import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getSession } from "@/lib/auth";
import { queryOne, query } from "@/lib/db";

const schema = z.object({
  senha_atual: z.string().min(1),
  nova_senha: z.string().min(6),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });

  const { senha_atual, nova_senha } = parsed.data;

  const usuario = await queryOne<{ password_hash: string | null }>(
    "SELECT password_hash FROM usuarios WHERE id = $1",
    [session.sub],
  );

  if (!usuario)
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 404 },
    );

  const senhaCorreta = usuario.password_hash
    ? await bcrypt.compare(senha_atual, usuario.password_hash)
    : false;

  if (!senhaCorreta)
    return NextResponse.json(
      { error: "Senha atual incorreta" },
      { status: 400 },
    );

  const hash = await bcrypt.hash(nova_senha, 12);
  await query("UPDATE usuarios SET password_hash = $1 WHERE id = $2", [
    hash,
    session.sub,
  ]);

  return NextResponse.json({ success: true });
}
