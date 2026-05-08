import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { join } from "path";
import { access, mkdir } from "fs/promises";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.perfil === "cliente") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const testTicketId = "test-volume-check";

  // Teste onde está sendo salvo
  const possiblePaths = [
    // Volume path
    process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "tickets", testTicketId)
      : null,
    // Public path
    join(process.cwd(), "public", "uploads", "tickets", testTicketId),
    // Root check
    process.cwd(),
    // Storage check
    "/app/storage",
  ].filter(Boolean);

  const results = [];

  for (const path of possiblePaths) {
    try {
      await access(path!);
      results.push({ path, exists: true, accessible: true });
    } catch (error) {
      try {
        await mkdir(path!, { recursive: true });
        results.push({ path, exists: false, created: true });
      } catch (mkdirError) {
        results.push({
          path,
          exists: false,
          error: mkdirError instanceof Error ? mkdirError.message : "Erro desconhecido"
        });
      }
    }
  }

  return NextResponse.json({
    env: {
      RAILWAY_VOLUME_MOUNT_PATH: process.env.RAILWAY_VOLUME_MOUNT_PATH,
      STORAGE_TYPE: process.env.STORAGE_TYPE,
      NODE_ENV: process.env.NODE_ENV,
    },
    paths: results,
    cwd: process.cwd(),
    timestamp: new Date().toISOString()
  });
}