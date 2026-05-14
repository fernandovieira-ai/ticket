import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

const ALLOWED_MIME = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
  "application/zip",
]);
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const rows = await query(
    `SELECT m.id, m.username, m.mensagem, m.criado_em AS created_at,
            (m.imagem IS NOT NULL) AS tem_imagem,
            COALESCE(m.anexos, '[]'::jsonb) AS anexos,
            u.avatar_url
     FROM intranet.mensagens m
     LEFT JOIN usuarios u ON lower(replace(u.nome, ' ', '.')) = lower(m.username)
     ORDER BY m.criado_em DESC
     LIMIT 100`
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const contentType = req.headers.get("content-type") ?? "";
  let mensagem: string;
  let uploadedFiles: Array<{ nome: string; url: string; tamanho: number; mime_type: string }> = [];

  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
    }

    mensagem = ((formData.get("mensagem") as string) ?? "").trim();

    const files = formData.getAll("arquivos") as File[];
    const uploadDir = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "mural")
      : path.join(process.cwd(), "public", "uploads", "mural");

    await mkdir(uploadDir, { recursive: true });

    for (const file of files) {
      if (!ALLOWED_MIME.has(file.type)) continue;
      if (file.size > MAX_FILE_SIZE) continue;
      const ext = path.extname(file.name).replace(/[^a-zA-Z0-9.]/g, "");
      const safeName = `${randomUUID()}${ext}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(path.join(uploadDir, safeName), buffer);
      uploadedFiles.push({
        nome: file.name,
        url: `/uploads/mural/${safeName}`,
        tamanho: file.size,
        mime_type: file.type,
      });
    }
  } else {
    let body: { mensagem?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }
    mensagem = body.mensagem?.trim() ?? "";
  }

  if (!mensagem) {
    return NextResponse.json({ error: "Mensagem é obrigatória" }, { status: 400 });
  }

  const rows = await query(
    `INSERT INTO intranet.mensagens (username, mensagem, anexos, criado_em, atualizado_em)
     VALUES ($1, $2, $3::jsonb, NOW(), NOW())
     RETURNING id, username, mensagem, criado_em AS created_at, COALESCE(anexos, '[]'::jsonb) AS anexos`,
    [session.nome, mensagem, JSON.stringify(uploadedFiles)]
  );

  return NextResponse.json(rows[0], { status: 201 });
}
