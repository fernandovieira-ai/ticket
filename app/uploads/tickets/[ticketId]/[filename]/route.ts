import { NextRequest, NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import { join, basename, extname } from "path";
import { getSession } from "@/lib/auth";
import { queryOne } from "@/lib/db";

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
  const session = await getSession();
  if (!session) {
    return new NextResponse("Não autenticado", { status: 401 });
  }

  const { ticketId, filename } = await params;

  console.log(`[Upload Route] Serving file: ${ticketId}/${filename} for user: ${session.sub}`);

  // Previne path traversal
  const safeTicketId = basename(ticketId);
  const safeFilename = basename(filename);

  if (!safeTicketId || !safeFilename) {
    console.log(`[Upload Route] Invalid ticketId or filename`);
    return new NextResponse("Not found", { status: 404 });
  }

  // Verificar se o usuário tem acesso ao ticket
  try {
    const ticket = await queryOne<{ id: string; aberto_por: string }>(
      `SELECT id, aberto_por FROM tickets WHERE id = $1 AND empresa_id = $2`,
      [safeTicketId, session.empresaId],
    );

    if (!ticket) {
      console.log(`[Upload Route] Ticket not found or access denied: ${safeTicketId}`);
      return new NextResponse("Ticket não encontrado", { status: 404 });
    }

    // Clientes só podem acessar anexos de tickets que eles mesmos abriram
    if (session.perfil === "cliente" && ticket.aberto_por !== session.sub) {
      console.log(`[Upload Route] Client access denied for ticket: ${safeTicketId}`);
      return new NextResponse("Acesso negado", { status: 403 });
    }
  } catch (error) {
    console.error(`[Upload Route] Database error:`, error);
    return new NextResponse("Erro interno", { status: 500 });
  }

  const ext = extname(safeFilename).toLowerCase();
  const mimeType = MIME[ext];
  if (!mimeType) {
    console.log(`[Upload Route] File type not allowed: ${ext}`);
    return new NextResponse("Tipo de arquivo não permitido", { status: 403 });
  }

  const filePath = join(
    process.cwd(),
    "public",
    "uploads",
    "tickets",
    safeTicketId,
    safeFilename,
  );

  console.log(`[Upload Route] Trying to serve file from: ${filePath}`);

  try {
    await access(filePath);
    const file = await readFile(filePath);
    console.log(`[Upload Route] Successfully served file: ${safeFilename} (${file.length} bytes)`);
    return new NextResponse(file, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `inline; filename="${safeFilename}"`,
      },
    });
  } catch (error) {
    console.error(`[Upload Route] File not found or error reading: ${filePath}`, error);
    return new NextResponse("Arquivo não encontrado", { status: 404 });
  }
}
