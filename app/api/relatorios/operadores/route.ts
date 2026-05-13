import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  const empresaId =
    session?.empresaId ?? "00000000-0000-0000-0000-000000000001";

  const { searchParams } = new URL(req.url);
  const inicio = searchParams.get("inicio");
  const fim    = searchParams.get("fim");
  const status = searchParams.get("status"); // código ex: 'aberto', 'finalizado'

  const conditions: string[] = [
    "u.empresa_id = $1",
    "u.perfil != 'cliente'",
    "u.ativo = true",
  ];
  const values: unknown[] = [empresaId];
  let idx = 2;

  if (inicio) { conditions.push(`t.criado_em >= $${idx++}`); values.push(inicio); }
  if (fim)    { conditions.push(`t.criado_em <= $${idx++}`); values.push(fim); }
  if (status) { conditions.push(`ts.codigo = $${idx++}`); values.push(status); }

  const rows = await query<{
    id: string;
    nome: string;
    perfil: string;
    total_tickets: number;
    total_clientes: number;
  }>(
    `SELECT
       u.id,
       u.nome,
       u.perfil,
       COUNT(t.id)::int                  AS total_tickets,
       COUNT(DISTINCT t.cliente_id)::int AS total_clientes
     FROM usuarios u
     JOIN tickets t ON t.atribuido_a = u.id
     JOIN ticket_status ts ON ts.id = t.status_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY u.id, u.nome, u.perfil
     ORDER BY total_tickets DESC
     LIMIT 50`,
    values,
  );

  const res = NextResponse.json(rows);
  res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
  return res;
}
