import { NextRequest, NextResponse } from "next/server";
import { readFile, access } from "fs/promises";
import { join, basename } from "path";

const ALLOWED_EXTS = [".png", ".jpg", ".jpeg", ".svg", ".webp"];

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function logoDir() {
  return process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "logos")
    : join(process.cwd(), "public", "uploads", "logos");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;

  // Previne path traversal
  const safe = basename(filename);
  const ext = safe.slice(safe.lastIndexOf(".")).toLowerCase();

  if (!ALLOWED_EXTS.includes(ext)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const filePath = join(logoDir(), safe);

  try {
    await access(filePath);
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": MIME[ext] ?? "application/octet-stream",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
