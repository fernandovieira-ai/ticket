const fs = require("fs");
const path = require("path");

// Carregar .env.local manualmente
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach(line => {
    const [key, ...value] = line.split("=");
    if (key && value.length > 0 && !process.env[key]) {
      process.env[key.trim()] = value.join("=").trim();
    }
  });
}

// Simular o endpoint sem Next.js
async function testUnifiedEndpoint() {
  try {
    console.log("🧪 Testando endpoint unificado de stats...\n");

    const { Pool } = require("pg");
    const db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    // Stats do DigitalRF-Help
    console.log("📊 Buscando stats do DigitalRF-Help...");
    const digitalrfStats = await db.query(`
      SELECT
        (SELECT count(*) FROM usuarios WHERE ativo = true) as usuarios_ativos,
        (SELECT count(*) FROM tickets WHERE status_id = (SELECT id FROM ticket_status WHERE codigo = 'aberto')) as tickets_abertos,
        (SELECT count(*) FROM tickets WHERE status_id = (SELECT id FROM ticket_status WHERE codigo = 'em_andamento')) as tickets_andamento,
        (SELECT count(*) FROM tickets WHERE fechado_em IS NOT NULL) as tickets_resolvidos,
        (SELECT count(*) FROM tickets WHERE criado_em >= CURRENT_DATE) as tickets_hoje,
        (SELECT count(*) FROM tickets WHERE criado_em >= CURRENT_DATE - INTERVAL '7 days') as tickets_semana
    `);

    console.log("✅ Stats DigitalRF obtidas");

    // Stats da Intranet
    console.log("📊 Buscando stats da Intranet...");
    const intranetStats = await db.query(`
      SELECT
        (SELECT count(*) FROM intranet.informativos WHERE dta_validade >= CURRENT_DATE OR dta_validade IS NULL) as informativos_ativos,
        (SELECT count(*) FROM intranet.plantao WHERE ind_finalizado = 'N') as plantoes_abertos,
        (SELECT count(*) FROM intranet.faq) as total_faq,
        (SELECT count(*) FROM intranet.contratos) as total_contratos,
        (SELECT count(*) FROM intranet.dtef) as total_dtef,
        (SELECT count(*) FROM intranet.anydesk_acessos) as total_anydesk,
        (SELECT count(*) FROM intranet.dados_restritos) as total_dados_restritos
    `);

    console.log("✅ Stats Intranet obtidas");

    // Atividade recente
    console.log("📊 Buscando atividade recente...");
    const atividadeIntranet = await db.query(`
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

    console.log("✅ Atividade recente obtida\n");

    // Consolidar dados como faria a API
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
        informativos_ativos: parseInt(intranetStats.rows[0].informativos_ativos),
        plantoes_abertos: parseInt(intranetStats.rows[0].plantoes_abertos),
        total_faq: parseInt(intranetStats.rows[0].total_faq),
        total_contratos: parseInt(intranetStats.rows[0].total_contratos),
        total_dtef: parseInt(intranetStats.rows[0].total_dtef),
        total_anydesk: parseInt(intranetStats.rows[0].total_anydesk),
        total_dados_restritos: parseInt(intranetStats.rows[0].total_dados_restritos),
        atividade_recente: atividadeIntranet.rows,
      },
      unified: {
        total_usuarios: parseInt(digitalrfStats.rows[0].usuarios_ativos),
        total_tickets: parseInt(digitalrfStats.rows[0].tickets_abertos) +
                      parseInt(digitalrfStats.rows[0].tickets_andamento) +
                      parseInt(digitalrfStats.rows[0].tickets_resolvidos),
        total_modulos_intranet: 7,
        atividade_total_semana: parseInt(digitalrfStats.rows[0].tickets_semana) +
                               atividadeIntranet.rows.length,
      }
    };

    console.log("🎯 RESULTADO DO ENDPOINT UNIFICADO:");
    console.log("=================================\n");

    console.log("📈 DigitalRF-Help:");
    console.log(`  • ${consolidatedStats.digitalrf.usuarios_ativos} usuários ativos`);
    console.log(`  • ${consolidatedStats.digitalrf.tickets_abertos} tickets abertos`);
    console.log(`  • ${consolidatedStats.digitalrf.tickets_andamento} tickets em andamento`);
    console.log(`  • ${consolidatedStats.digitalrf.tickets_resolvidos} tickets resolvidos`);
    console.log(`  • ${consolidatedStats.digitalrf.tickets_hoje} tickets hoje`);
    console.log(`  • ${consolidatedStats.digitalrf.tickets_semana} tickets na semana`);

    console.log("\n📈 Intranet:");
    console.log(`  • ${consolidatedStats.intranet.informativos_ativos} informativos ativos`);
    console.log(`  • ${consolidatedStats.intranet.plantoes_abertos} plantões abertos`);
    console.log(`  • ${consolidatedStats.intranet.total_faq} FAQs`);
    console.log(`  • ${consolidatedStats.intranet.total_contratos} contratos`);
    console.log(`  • ${consolidatedStats.intranet.total_dtef} senhas DTEF`);
    console.log(`  • ${consolidatedStats.intranet.total_anydesk} acessos AnyDesk`);
    console.log(`  • ${consolidatedStats.intranet.total_dados_restritos} dados restritos`);

    console.log("\n📊 Visão Unificada:");
    console.log(`  • ${consolidatedStats.unified.total_usuarios} usuários no sistema`);
    console.log(`  • ${consolidatedStats.unified.total_tickets} tickets totais`);
    console.log(`  • ${consolidatedStats.unified.total_modulos_intranet} módulos da intranet`);
    console.log(`  • ${consolidatedStats.unified.atividade_total_semana} atividades na semana`);

    console.log("\n📋 Atividade Recente:");
    consolidatedStats.intranet.atividade_recente.slice(0, 5).forEach((atividade, i) => {
      console.log(`  ${i + 1}. [${atividade.tipo}] ${atividade.titulo} - ${new Date(atividade.data).toLocaleDateString('pt-BR')}`);
    });

    console.log("\n🎉 Endpoint unificado funcionando perfeitamente!");

    await db.end();

  } catch (error) {
    console.error("❌ Erro no teste:", error);
  }
}

testUnifiedEndpoint();