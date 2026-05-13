import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join, basename, extname } from "path";
import { getSession } from "@/lib/auth";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  const session = await getSession();
  if (!session) return new NextResponse("Não autenticado", { status: 401 });

  const { filename } = await params;
  const safeFilename = basename(filename);
  if (!safeFilename) return new NextResponse("Not found", { status: 404 });

  const ext = extname(safeFilename).toLowerCase();
  const mimeType = MIME[ext] ?? "application/octet-stream";

  const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "intranet", "faq")
    : join(process.cwd(), "public", "uploads", "intranet", "faq");

  const filePath = join(dir, safeFilename);

  try {
    const data = await readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new NextResponse("Imagem não encontrada", { status: 404 });
  }
}
