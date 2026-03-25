import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const config = await queryOne<Record<string, unknown>>(
    `SELECT wc.*, c.nome AS categoria_padrao_nome
     FROM whatsapp_config wc
     LEFT JOIN categorias c ON c.id = wc.categoria_padrao_id
     WHERE wc.empresa_id = $1`,
    [session.empresaId]
  );

  return NextResponse.json(config ?? {});
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const {
    horario_bot_inicio,
    horario_bot_fim,
    msg_boas_vindas,
    msg_fora_horario,
    msg_ticket_criado,
    msg_ticket_respondido,
    ia_ativa,
    ia_modo,
    ia_confianca_min,
    ia_prompt_sistema,
    criar_ticket_auto,
    categoria_padrao_id,
  } = body;

  await query(
    `INSERT INTO whatsapp_config (
       empresa_id, horario_bot_inicio, horario_bot_fim,
       msg_boas_vindas, msg_fora_horario, msg_ticket_criado, msg_ticket_respondido,
       ia_ativa, ia_modo, ia_confianca_min, ia_prompt_sistema,
       criar_ticket_auto, categoria_padrao_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (empresa_id) DO UPDATE SET
       horario_bot_inicio    = EXCLUDED.horario_bot_inicio,
       horario_bot_fim       = EXCLUDED.horario_bot_fim,
       msg_boas_vindas       = EXCLUDED.msg_boas_vindas,
       msg_fora_horario      = EXCLUDED.msg_fora_horario,
       msg_ticket_criado     = EXCLUDED.msg_ticket_criado,
       msg_ticket_respondido = EXCLUDED.msg_ticket_respondido,
       ia_ativa              = EXCLUDED.ia_ativa,
       ia_modo               = EXCLUDED.ia_modo,
       ia_confianca_min      = EXCLUDED.ia_confianca_min,
       ia_prompt_sistema     = EXCLUDED.ia_prompt_sistema,
       criar_ticket_auto     = EXCLUDED.criar_ticket_auto,
       categoria_padrao_id   = EXCLUDED.categoria_padrao_id`,
    [
      session.empresaId,
      horario_bot_inicio ?? "08:00",
      horario_bot_fim ?? "18:00",
      msg_boas_vindas,
      msg_fora_horario,
      msg_ticket_criado,
      msg_ticket_respondido,
      ia_ativa ?? false,
      ia_modo ?? "sugestao",
      ia_confianca_min ?? 0.75,
      ia_prompt_sistema ?? null,
      criar_ticket_auto ?? true,
      categoria_padrao_id ?? null,
    ]
  );

  return NextResponse.json({ ok: true });
}
