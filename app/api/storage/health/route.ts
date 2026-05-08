import { NextRequest, NextResponse } from "next/server";
import { access, stat, readdir } from "fs/promises";
import { join } from "path";
import { getSession } from "@/lib/auth";

// Rota de monitoramento do storage
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.perfil === "cliente") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  try {
    const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads")
      : join(process.cwd(), "public", "uploads");

    const ticketsDir = join(storageRoot, "tickets");

    // Verificar se diretório existe
    let dirExists = false;
    let totalFiles = 0;
    let totalSize = 0;
    let oldestFile: Date | null = null;
    let newestFile: Date | null = null;

    try {
      await access(ticketsDir);
      dirExists = true;

      // Contar arquivos e calcular estatísticas
      const tickets = await readdir(ticketsDir).catch(() => []);

      for (const ticketId of tickets) {
        if (ticketId === '.gitkeep') continue;

        const ticketPath = join(ticketsDir, ticketId);
        const files = await readdir(ticketPath).catch(() => []);

        for (const file of files) {
          const filePath = join(ticketPath, file);
          const stats = await stat(filePath).catch(() => null);

          if (stats) {
            totalFiles++;
            totalSize += stats.size;

            if (!oldestFile || stats.birthtime < oldestFile) {
              oldestFile = stats.birthtime;
            }
            if (!newestFile || stats.birthtime > newestFile) {
              newestFile = stats.birthtime;
            }
          }
        }
      }
    } catch {
      dirExists = false;
    }

    const health = {
      status: dirExists ? "healthy" : "error",
      storage: {
        type: process.env.RAILWAY_VOLUME_MOUNT_PATH ? "volume" : "local",
        path: storageRoot,
        accessible: dirExists
      },
      stats: {
        totalFiles,
        totalSizeBytes: totalSize,
        totalSizeMB: Math.round(totalSize / (1024 * 1024) * 100) / 100,
        oldestFile: oldestFile?.toISOString() || null,
        newestFile: newestFile?.toISOString() || null
      },
      timestamp: new Date().toISOString()
    };

    return NextResponse.json(health);
  } catch (error) {
    console.error("[STORAGE-HEALTH] Erro:", error);
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : "Erro desconhecido",
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}