import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

type Params = { params: Promise<{ nome: string }> };

// GET /api/intranet/mensagens/arquivo/[nome] — serve arquivos do mural do volume Railway
export async function GET(
  _req: NextRequest,
  { params }: Params
) {
  const session = await getSession();
  if (!session) return new Response("Não autenticado", { status: 401 });

  const { nome } = await params;

  // Sanitize: apenas nome de arquivo simples (sem path traversal)
  const safeName = path.basename(nome);
  if (!safeName || safeName !== nome) {
    return new Response("Nome inválido", { status: 400 });
  }

  const filePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "mural", safeName)
    : path.join(process.cwd(), "public", "uploads", "mural", safeName);

  let buffer: Buffer;
  try {
    buffer = await readFile(filePath);
  } catch {
    return new Response("Arquivo não encontrado", { status: 404 });
  }

  // Determinar content-type pela extensão
  const ext = path.extname(safeName).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".txt": "text/plain",
    ".zip": "application/zip",
    ".csv": "text/csv",
  };
  const contentType = mimeMap[ext] ?? "application/octet-stream";

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=86400",
      "Content-Disposition": `inline; filename="${safeName}"`,
    },
  });
}
