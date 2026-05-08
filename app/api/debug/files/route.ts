import { NextRequest, NextResponse } from "next/server";
import { readdir } from "fs/promises";
import { join } from "path";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.perfil === "cliente") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ticketId = searchParams.get("ticketId");

  if (!ticketId) {
    return NextResponse.json({ error: "ticketId necessário" }, { status: 400 });
  }

  try {
    const ticketDir = join(process.cwd(), "public", "uploads", "tickets", ticketId);
    console.log("[DEBUG] Verificando diretório:", ticketDir);

    const files = await readdir(ticketDir).catch(() => []);
    console.log("[DEBUG] Arquivos encontrados:", files);

    return NextResponse.json({
      ticketId,
      directory: ticketDir,
      files,
      cwd: process.cwd()
    });
  } catch (error) {
    console.error("[DEBUG] Erro:", error);
    return NextResponse.json({
      error: error.message,
      ticketId,
      cwd: process.cwd()
    });
  }
}