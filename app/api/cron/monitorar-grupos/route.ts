import { NextRequest, NextResponse } from "next/server";
import {
  buscarEmpresasComMonitoramento,
  monitorarGruposDaEmpresa,
  type ResultadoMonitoramento,
} from "@/lib/monitoramento-grupos";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/monitorar-grupos
 *
 * Disparado pelo scheduler (Railway Cron, Vercel Cron, etc.) a cada X minutos.
 * Verifica todos os grupos monitorados com interações sem resposta além do SLA
 * e envia alertas no grupo de suporte configurado.
 *
 * Proteção por header: x-cron-secret deve bater com CRON_SECRET no .env
 *
 * Configuração no Railway:
 *   Schedule : *\/15 * * * *   (a cada 15 minutos)
 *   URL      : https://seu-dominio.com/api/cron/monitorar-grupos
 *   Headers  : x-cron-secret=<valor de CRON_SECRET>
 */
export async function GET(req: NextRequest) {
  // Valida secret para impedir chamadas não autorizadas
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const inicio = Date.now();
  const resultados: ResultadoMonitoramento[] = [];

  try {
    const empresaIds = await buscarEmpresasComMonitoramento();

    // Processa cada empresa de forma sequencial para não sobrecarregar a API
    for (const empresaId of empresaIds) {
      const resultado = await monitorarGruposDaEmpresa(empresaId);
      resultados.push(resultado);

      if (resultado.erro) {
        console.error(
          "[Cron] Erro na empresa %s: %s",
          empresaId,
          resultado.erro,
        );
      } else {
        console.log(
          "[Cron] empresa=%s pendentes=%d auto_resolvidos=%d alertas=%d suprimidos_ia=%d",
          empresaId,
          resultado.total_pendentes,
          resultado.auto_resolvidos,
          resultado.alertas_enviados,
          resultado.alertas_suprimidos_ia,
        );
      }
    }
  } catch (err) {
    console.error("[Cron] Falha geral no monitoramento:", err);
    return NextResponse.json(
      { error: "Falha interna", detalhe: String(err) },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    executado_em: new Date().toISOString(),
    duracao_ms: Date.now() - inicio,
    empresas_processadas: resultados.length,
    resultados,
  });
}
