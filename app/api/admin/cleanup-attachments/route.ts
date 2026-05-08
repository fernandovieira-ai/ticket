import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { access } from "fs/promises";
import { join } from "path";

// Limpa anexos órfãos (sem arquivo físico correspondente)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.perfil !== "admin") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");

  try {
    if (action === "list-broken") {
      // Lista anexos quebrados
      const anexos = await query<{
        id: string;
        mensagem_id: string;
        nome: string;
        url: string;
        ticket_id?: string;
      }>(`
        SELECT a.id, a.mensagem_id, a.nome, a.url, m.ticket_id
        FROM anexos_mensagem a
        JOIN mensagens m ON m.id = a.mensagem_id
        ORDER BY a.id DESC
        LIMIT 50
      `);

      const brokenFiles = [];
      const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH
        ? process.env.RAILWAY_VOLUME_MOUNT_PATH
        : join(process.cwd(), "public");

      for (const anexo of anexos) {
        // Construir caminho do arquivo
        const filePath = join(storageRoot, anexo.url.replace(/^\//, ''));

        try {
          await access(filePath);
          // Arquivo existe
        } catch {
          // Arquivo não existe - anexo quebrado
          brokenFiles.push(anexo);
        }
      }

      return NextResponse.json({
        totalAnexos: anexos.length,
        anexosQuebrados: brokenFiles.length,
        arquivosQuebrados: brokenFiles
      });

    } else if (action === "remove-broken") {
      // Remove anexos quebrados
      const anexos = await query<{
        id: string;
        mensagem_id: string;
        url: string;
      }>(`
        SELECT a.id, a.mensagem_id, a.url
        FROM anexos_mensagem a
        ORDER BY a.id
      `);

      const storageRoot = process.env.RAILWAY_VOLUME_MOUNT_PATH
        ? process.env.RAILWAY_VOLUME_MOUNT_PATH
        : join(process.cwd(), "public");

      const idsParaRemover = [];

      for (const anexo of anexos) {
        const filePath = join(storageRoot, anexo.url.replace(/^\//, ''));

        try {
          await access(filePath);
          // Arquivo existe - manter
        } catch {
          // Arquivo não existe - marcar para remoção
          idsParaRemover.push(anexo.id);
        }
      }

      if (idsParaRemover.length > 0) {
        const placeholders = idsParaRemover.map((_, i) => `$${i + 1}`).join(', ');
        await query(
          `DELETE FROM anexos_mensagem WHERE id IN (${placeholders})`,
          idsParaRemover
        );
      }

      return NextResponse.json({
        removidos: idsParaRemover.length,
        idsRemovidos: idsParaRemover
      });

    } else if (action === "remove-all") {
      // Remove TODOS os anexos (use com cuidado!)
      const result = await query(`DELETE FROM anexos_mensagem`);

      return NextResponse.json({
        message: "Todos os anexos removidos",
        totalRemovidos: result.length
      });

    } else {
      return NextResponse.json({
        message: "Cleanup de Anexos",
        actions: [
          "?action=list-broken - Lista anexos quebrados",
          "?action=remove-broken - Remove anexos sem arquivo",
          "?action=remove-all - Remove TODOS os anexos (cuidado!)"
        ]
      });
    }

  } catch (error) {
    console.error("[CLEANUP] Erro:", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro desconhecido"
    }, { status: 500 });
  }
}