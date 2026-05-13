// Endpoint TEMPORÁRIO para exportar imagens FAQ do volume Railway
// Acesse em: GET /api/intranet/faq/export-images
// Remove este arquivo após baixar as imagens localmente

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query } from "@/lib/db";
import { readFile, readdir } from "fs/promises";
import { join } from "path";

function faqImgDir() {
  return process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "intranet", "faq")
    : join(process.cwd(), "public", "uploads", "intranet", "faq");
}

export async function GET() {
  const session = await getSession();
  if (!session) return new NextResponse("Unauthorized", { status: 401 });

  const rows = await query<{ id: number; caminho_arquivo: string; tipo_arquivo: string }>(
    "SELECT id, caminho_arquivo, tipo_arquivo FROM intranet.faq WHERE caminho_arquivo IS NOT NULL"
  );

  const dir = faqImgDir();
  const files: { name: string; base64: string; mime: string }[] = [];

  for (const row of rows) {
    const filename = row.caminho_arquivo.includes("/")
      ? row.caminho_arquivo.split("/").pop()!
      : row.caminho_arquivo;
    const fullPath = join(dir, filename);
    try {
      const data = await readFile(fullPath);
      files.push({
        name: filename,
        base64: data.toString("base64"),
        mime: row.tipo_arquivo ?? "image/jpeg",
      });
    } catch {
      // arquivo não encontrado — ignora
    }
  }

  return NextResponse.json({ total: files.length, files });
}
