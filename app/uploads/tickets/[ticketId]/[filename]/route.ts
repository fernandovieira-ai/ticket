import { NextRequest, NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import { join, basename, extname } from "path";
import { getSession } from "@/lib/auth";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".zip": "application/zip",
  ".rar": "application/x-rar-compressed",
  ".7z": "application/x-7z-compressed",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ticketId: string; filename: string }> },
) {
  console.log('[ATTACHMENT] Route acessada', new Date().toISOString());

  const session = await getSession();
  console.log('[ATTACHMENT] Session:', session ? 'authenticated' : 'not authenticated');

  if (!session) {
    console.log('[ATTACHMENT] Retornando 401 - não autenticado');
    return new NextResponse("Não autenticado", { status: 401 });
  }

  const { ticketId, filename } = await params;
  console.log('[ATTACHMENT] Parâmetros:', { ticketId, filename });

  // Previne path traversal
  const safeTicketId = basename(ticketId);
  const safeFilename = basename(filename);
  console.log('[ATTACHMENT] Safe params:', { safeTicketId, safeFilename });

  if (!safeTicketId || !safeFilename) {
    console.log('[ATTACHMENT] Parâmetros inválidos, retornando 404');
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = extname(safeFilename).toLowerCase();
  const mimeType = MIME[ext];
  console.log('[ATTACHMENT] Extension e MIME:', { ext, mimeType });

  if (!mimeType) {
    console.log('[ATTACHMENT] MIME type não permitido, retornando 403');
    return new NextResponse("Tipo de arquivo não permitido", { status: 403 });
  }

  // Usa volume persistente no Railway ou public local
  const filePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "tickets", safeTicketId, safeFilename)
    : join(process.cwd(), "public", "uploads", "tickets", safeTicketId, safeFilename);
  console.log('[ATTACHMENT] FilePath:', filePath);

  try {
    await access(filePath);
    console.log('[ATTACHMENT] Arquivo acessível, lendo...');
    const file = await readFile(filePath);
    console.log('[ATTACHMENT] Arquivo lido, tamanho:', file.length);
    return new NextResponse(file, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${safeFilename}"`,
      },
    });
  } catch (error) {
    console.log('[ATTACHMENT] Erro ao acessar arquivo:', error);
    return new NextResponse("Not found", { status: 404 });
  }
}
