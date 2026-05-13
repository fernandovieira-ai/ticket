import { NextRequest, NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import { join, basename, extname } from "path";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const safeFilename = basename(filename);

  const ext = extname(safeFilename).toLowerCase();
  const mimeType = MIME[ext];
  if (!mimeType) return new NextResponse("Tipo não permitido", { status: 403 });

  // Railway volume ou fallback local
  const filePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "avatars", safeFilename)
    : join(process.cwd(), "public", "uploads", "avatars", safeFilename);

  try {
    await access(filePath);
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
