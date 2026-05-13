import { NextRequest, NextResponse } from 'next/server';
import { query, intranetQueries } from '@/lib/db-unified';

export async function GET(request: NextRequest) {
  try {
    // Stats do DigitalRF-Help
    const digitalrfStats = await query(`
      SELECT
        (SELECT count(*) FROM usuarios WHERE ativo = true) as usuarios_ativos,
        (SELECT count(*) FROM tickets WHERE status_id = (SELECT id FROM ticket_status WHERE codigo = 'aberto')) as tickets_abertos,
        (SELECT count(*) FROM tickets WHERE status_id = (SELECT id FROM ticket_status WHERE codigo = 'em_andamento')) as tickets_andamento,
        (SELECT count(*) FROM tickets WHERE fechado_em IS NOT NULL) as tickets_resolvidos,
        (SELECT count(*) FROM tickets WHERE criado_em >= CURRENT_DATE) as tickets_hoje,
        (SELECT count(*) FROM tickets WHERE criado_em >= CURRENT_DATE - INTERVAL '7 days') as tickets_semana
    `);

    // Stats da Intranet
    const intranetStats = await intranetQueries.getDashboardStats();

    // Atividade recente da intranet
    const atividadeIntranet = await query(`
      SELECT
        'informativo' as tipo,
        titulo as titulo,
        criado_em as data
      FROM intranet.informativos
      WHERE criado_em >= CURRENT_DATE - INTERVAL '7 days'

      UNION ALL

      SELECT
        'plantao' as tipo,
        CONCAT('Plantão: ', analista) as titulo,
        criado_em as data
      FROM intranet.plantao
      WHERE criado_em >= CURRENT_DATE - INTERVAL '7 days'

      UNION ALL

      SELECT
        'faq' as tipo,
        CONCAT(nom_sistema, ': ', SUBSTRING(des_assunto, 1, 50)) as titulo,
        criado_em as data
      FROM intranet.faq
      WHERE criado_em >= CURRENT_DATE - INTERVAL '7 days'

      ORDER BY data DESC
      LIMIT 10
    `);

    // Consolidar dados
    const consolidatedStats = {
      digitalrf: {
        usuarios_ativos: parseInt(digitalrfStats.rows[0].usuarios_ativos),
        tickets_abertos: parseInt(digitalrfStats.rows[0].tickets_abertos),
        tickets_andamento: parseInt(digitalrfStats.rows[0].tickets_andamento),
        tickets_resolvidos: parseInt(digitalrfStats.rows[0].tickets_resolvidos),
        tickets_hoje: parseInt(digitalrfStats.rows[0].tickets_hoje),
        tickets_semana: parseInt(digitalrfStats.rows[0].tickets_semana),
      },
      intranet: {
        informativos_ativos: parseInt(intranetStats.informativos_ativos),
        plantoes_abertos: parseInt(intranetStats.plantoes_abertos),
        total_faq: parseInt(intranetStats.total_faq),
        total_contratos: parseInt(intranetStats.total_contratos),
        total_dtef: parseInt(intranetStats.total_dtef),
        total_anydesk: parseInt(intranetStats.total_anydesk),
        total_dados_restritos: parseInt(intranetStats.total_dados_restritos),
        atividade_recente: atividadeIntranet.rows,
      },
      // Stats unificados para visão geral
      unified: {
        total_usuarios: parseInt(digitalrfStats.rows[0].usuarios_ativos),
        total_tickets: parseInt(digitalrfStats.rows[0].tickets_abertos) +
                      parseInt(digitalrfStats.rows[0].tickets_andamento) +
                      parseInt(digitalrfStats.rows[0].tickets_resolvidos),
        total_modulos_intranet: 7, // Número de módulos da intranet
        atividade_total_semana: parseInt(digitalrfStats.rows[0].tickets_semana) +
                               atividadeIntranet.rows.length,
      }
    };

    return NextResponse.json(consolidatedStats);

  } catch (error) {
    console.error('Erro ao buscar stats unificados:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor ao buscar estatísticas' },
      { status: 500 }
    );
  }
}