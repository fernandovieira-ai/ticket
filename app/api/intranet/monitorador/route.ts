import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMonitoradorData } from "@/lib/monitorador";

export const dynamic = "force-dynamic";

// GET /api/intranet/monitorador
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const dados = await getMonitoradorData();
    return NextResponse.json(dados);
  } catch (error) {
    console.error("Erro ao buscar dados do monitor:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do monitor" },
      { status: 500 }
    );
  }
}
