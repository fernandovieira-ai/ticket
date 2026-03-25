import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { query, queryOne } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const config = await queryOne<Record<string, unknown>>(
    `SELECT id, empresa_id, provedor, modelo, max_tokens,
            prompt_sugestao, prompt_classificar, prompt_resumir, prompt_whatsapp_bot,
            limite_diario, ativo,
            CASE WHEN openai_api_key IS NOT NULL AND openai_api_key != '' THEN true ELSE false END AS openai_key_configurada
     FROM ia_config WHERE empresa_id = $1`,
    [session.empresaId],
  );

  // Retorna defaults se ainda não existe registro
  return NextResponse.json(
    config ?? {
      provedor: "claude",
      modelo: process.env.AI_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: parseInt(process.env.AI_MAX_TOKENS ?? "1024"),
      prompt_sugestao: null,
      prompt_classificar: null,
      prompt_resumir: null,
      prompt_whatsapp_bot: null,
      limite_diario: 500,
      ativo: true,
      openai_key_configurada: false,
    },
  );
}

const configSchema = z.object({
  provedor: z.enum(["claude", "openai"]).optional(),
  modelo: z.string().min(1).max(100).optional(),
  openai_api_key: z.string().nullable().optional(),
  max_tokens: z.number().int().min(256).max(4096).optional(),
  prompt_sugestao: z.string().nullable().optional(),
  prompt_classificar: z.string().nullable().optional(),
  prompt_resumir: z.string().nullable().optional(),
  prompt_whatsapp_bot: z.string().nullable().optional(),
  limite_diario: z.number().int().min(0).max(10000).optional(),
  ativo: z.boolean().optional(),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if (!["admin", "supervisor"].includes(session.perfil))
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = configSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: "Dados inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );

  const {
    provedor,
    modelo,
    openai_api_key,
    max_tokens,
    prompt_sugestao,
    prompt_classificar,
    prompt_resumir,
    prompt_whatsapp_bot,
    limite_diario,
    ativo,
  } = parsed.data;

  await query(
    `INSERT INTO ia_config
       (empresa_id, provedor, modelo, openai_api_key, max_tokens,
        prompt_sugestao, prompt_classificar, prompt_resumir, prompt_whatsapp_bot,
        limite_diario, ativo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (empresa_id) DO UPDATE SET
       provedor             = COALESCE($2, ia_config.provedor),
       modelo               = COALESCE($3, ia_config.modelo),
       openai_api_key       = CASE WHEN $4 IS NOT NULL THEN $4 ELSE ia_config.openai_api_key END,
       max_tokens           = COALESCE($5, ia_config.max_tokens),
       prompt_sugestao      = $6,
       prompt_classificar   = $7,
       prompt_resumir       = $8,
       prompt_whatsapp_bot  = $9,
       limite_diario        = COALESCE($10, ia_config.limite_diario),
       ativo                = COALESCE($11, ia_config.ativo)`,
    [
      session.empresaId,
      provedor ?? null,
      modelo ?? null,
      openai_api_key ?? null,
      max_tokens ?? null,
      prompt_sugestao ?? null,
      prompt_classificar ?? null,
      prompt_resumir ?? null,
      prompt_whatsapp_bot ?? null,
      limite_diario ?? null,
      ativo ?? null,
    ],
  );

  return NextResponse.json({ ok: true });
}
