import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { notificarWhatsappChamadosAtrasados, type ResultadoAlertaAtraso } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/alertar-chamados-atrasados
 *
 * Cron job que verifica chamados com SLA de resolução vencido e envia
 * alerta WhatsApp para o operador responsável.
 *
 * Anti-spam: renotifica no máximo a cada 2 horas por chamado.
 *
 * Configuração no Railway / Vercel Cron:
 *   Schedule : 0 * * * *   (a cada hora)
 *   URL      : https://seu-dominio.com/api/cron/alertar-chamados-atrasados
 *   Headers  : x-cron-secret=<valor de CRON_SECRET>
 *
 * Pré-requisito: executar migration chamados_schema_v1.14_alerta_atraso.sql
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  const resultados: ResultadoAlertaAtraso[] = [];

  try {
    // Busca todas as empresas que têm instância WhatsApp conectada
    const empresas = await query<{ empresa_id: string }>(
      `SELECT DISTINCT empresa_id
       FROM whatsapp_instancias
       WHERE ativo = TRUE AND status = 'conectado'`,
    );

    for (const { empresa_id } of empresas) {
      const resultado = await notificarWhatsappChamadosAtrasados(empresa_id);
      resultados.push(resultado);

      console.log(
        "[Cron-Atraso] empresa=%s atrasados=%d enviados=%d falhos=%d sem_tel=%d cliente_ok=%d cliente_falha=%d",
        empresa_id,
        resultado.tickets_atrasados,
        resultado.alertas_enviados,
        resultado.alertas_falhos,
        resultado.sem_telefone,
        resultado.alertas_cliente_enviados,
        resultado.alertas_cliente_falhos,
      );
    }
  } catch (err) {
    console.error("[Cron-Atraso] Falha geral:", err);
    return NextResponse.json(
      { error: "Falha interna", detalhe: String(err) },
      { status: 500 },
    );
  }

  const totalEnviados = resultados.reduce((s, r) => s + r.alertas_enviados, 0);
  const totalAtrasados = resultados.reduce((s, r) => s + r.tickets_atrasados, 0);

  return NextResponse.json({
    ok: true,
    executado_em: new Date().toISOString(),
    duracao_ms: Date.now() - inicio,
    empresas_processadas: resultados.length,
    total_atrasados: totalAtrasados,
    total_alertas_enviados: totalEnviados,
    resultados,
  });
}
