import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session)
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file)
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 },
      );
    if (!ALLOWED_TYPES.includes(file.type))
      return NextResponse.json(
        { error: "Tipo inválido. Use PNG, JPG ou WebP" },
        { status: 400 },
      );
    if (file.size > MAX_SIZE)
      return NextResponse.json(
        { error: "Arquivo muito grande (máx 2MB)" },
        { status: 400 },
      );

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const filename = `${randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadDir = join(process.cwd(), "public", "uploads", "avatars");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(join(uploadDir, filename), buffer);

    const url = `/uploads/avatars/${filename}`;

    await query("UPDATE usuarios SET avatar_url = $1 WHERE id = $2", [
      url,
      session.sub,
    ]);

    return NextResponse.json({ url });
  } catch (err) {
    console.error("[POST /api/upload/avatar]", err);
    return NextResponse.json(
      { error: "Erro ao salvar arquivo" },
      { status: 500 },
    );
  }
}
