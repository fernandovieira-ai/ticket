// Verificação de licença chamada pelo relay do Remote Assist DRF
// (projeto remotodrf, RemoteAssist.Relay/LicenseClient.cs) antes de aceitar o registro
// de um anfitrião da edição Cliente. Não usa sessão de usuário: autentica por segredo compartilhado.
// Header: x-relay-secret=<REMOTEASSIST_RELAY_SECRET>
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryOne } from "@/lib/db";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  device_id: z.string().trim().regex(/^\d{9}$/, "ID deve ter 9 dígitos"),
});

interface Row {
  status: "pendente" | "ativo" | "suspenso" | "cancelado";
  vencimento: string | null;
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-relay-secret");
  if (!secret || !process.env.REMOTEASSIST_RELAY_SECRET || secret !== process.env.REMOTEASSIST_RELAY_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "device_id inválido" }, { status: 400 });
  }

  const { device_id } = parsed.data;

  try {
    // Primeiro contato com este ID: cria sozinho como "pendente" (bloqueado até liberar no painel).
    // ON CONFLICT com update inócuo só para poder usar RETURNING e também marcar o último contato.
    const row = await queryOne<Row>(
      `INSERT INTO remoteassist_licencas (device_id, ultimo_contato_em)
       VALUES ($1, NOW())
       ON CONFLICT (device_id) DO UPDATE SET ultimo_contato_em = NOW()
       RETURNING status, vencimento::text AS vencimento`,
      [device_id],
    );

    if (!row) {
      return NextResponse.json({ status: "pendente", liberado: false });
    }

    // Compara só a data (YYYY-MM-DD): a licença fica válida até o fim do dia do vencimento.
    const hojeStr = new Date().toISOString().slice(0, 10);
    const venceu = row.vencimento != null && row.vencimento < hojeStr;
    const efetivo = venceu ? "vencido" : row.status;
    const liberado = row.status === "ativo" && !venceu;

    return NextResponse.json({ status: efetivo, liberado, vencimento: row.vencimento });
  } catch (err) {
    console.error("[POST /api/remoteassist/licencas/verificar]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
