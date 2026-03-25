import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { queryOne, query } from "@/lib/db";
import type { Usuario } from "@/types";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? "Dados inválidos";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { token, password } = parsed.data;

  // Verificar token
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (payload["type"] !== "password_reset" || !payload.sub) {
      return NextResponse.json({ error: "Token inválido" }, { status: 400 });
    }
    userId = payload.sub as string;
  } catch {
    return NextResponse.json(
      { error: "Token expirado ou inválido. Solicite um novo link." },
      { status: 400 },
    );
  }

  // Verificar se usuário ainda existe e é operador ativo
  const usuario = await queryOne<Pick<Usuario, "id">>(
    `SELECT id FROM usuarios WHERE id = $1 AND perfil != 'cliente' AND ativo = true LIMIT 1`,
    [userId],
  );

  if (!usuario)
    return NextResponse.json(
      { error: "Usuário não encontrado" },
      { status: 404 },
    );

  const passwordHash = await bcrypt.hash(password, 12);

  await query(
    `UPDATE usuarios SET password_hash = $1, atualizado_em = now() WHERE id = $2`,
    [passwordHash, userId],
  );

  return NextResponse.json({ ok: true });
}
