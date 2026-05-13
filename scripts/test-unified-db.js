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

// Importar TypeScript usando esm transpilation
async function testUnifiedDB() {
  try {
    console.log("🧪 Testando conexão unificada...\n");

    // Como estamos em JS, vamos fazer as queries diretamente
    const { Pool } = require("pg");

    const db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    // 1. Testar schema public (DigitalRF-Help)
    console.log("🔍 Testando schema public (DigitalRF-Help):");
    const usersResult = await db.query('SELECT id, nome, email FROM usuarios LIMIT 3');
    console.log(`✅ ${usersResult.rows.length} usuários encontrados:`);
    for (const user of usersResult.rows) {
      console.log(`  - ${user.nome} (${user.email})`);
    }

    // 2. Testar schema intranet
    console.log("\n🔍 Testando schema intranet:");

    // Informativos
    const informativos = await db.query('SELECT titulo FROM intranet.informativos ORDER BY criado_em DESC LIMIT 3');
    console.log(`✅ ${informativos.rows.length} informativos:`);
    for (const info of informativos.rows) {
      console.log(`  - ${info.titulo}`);
    }

    // Plantão
    const plantao = await db.query('SELECT analista, dtainicio FROM intranet.plantao ORDER BY dtainicio DESC LIMIT 3');
    console.log(`✅ ${plantao.rows.length} registros de plantão:`);
    for (const p of plantao.rows) {
      console.log(`  - ${p.analista} (${p.dtainicio.toISOString().split('T')[0]})`);
    }

    // FAQ
    const faq = await db.query('SELECT nom_sistema, des_assunto FROM intranet.faq LIMIT 3');
    console.log(`✅ ${faq.rows.length} FAQs:`);
    for (const f of faq.rows) {
      console.log(`  - ${f.nom_sistema}: ${f.des_assunto.substring(0, 50)}...`);
    }

    // 3. Stats unificados
    console.log("\n📊 Stats para dashboard unificado:");
    const stats = await db.query(`
      SELECT
        -- DigitalRF stats
        (SELECT count(*) FROM usuarios) as total_usuarios,
        (SELECT count(*) FROM tickets WHERE status_id = (SELECT id FROM ticket_status WHERE nome = 'Aberto')) as tickets_abertos,

        -- Intranet stats
        (SELECT count(*) FROM intranet.informativos WHERE dta_validade >= CURRENT_DATE OR dta_validade IS NULL) as informativos_ativos,
        (SELECT count(*) FROM intranet.plantao WHERE ind_finalizado = 'N') as plantoes_abertos,
        (SELECT count(*) FROM intranet.faq) as total_faq,
        (SELECT count(*) FROM intranet.contratos) as total_contratos,
        (SELECT count(*) FROM intranet.dtef) as total_dtef
    `);

    const s = stats.rows[0];
    console.log("📈 DigitalRF-Help:");
    console.log(`  • ${s.total_usuarios} usuários cadastrados`);
    console.log(`  • ${s.tickets_abertos} tickets abertos`);

    console.log("📈 Intranet:");
    console.log(`  • ${s.informativos_ativos} informativos ativos`);
    console.log(`  • ${s.plantoes_abertos} plantões em aberto`);
    console.log(`  • ${s.total_faq} FAQs disponíveis`);
    console.log(`  • ${s.total_contratos} contratos cadastrados`);
    console.log(`  • ${s.total_dtef} senhas DTEF`);

    await db.end();
    console.log("\n🎉 Teste de conectividade unificada realizado com sucesso!");
    console.log("🔗 Ambos os schemas (public + intranet) estão funcionando perfeitamente");

  } catch (error) {
    console.error("❌ Erro no teste:", error);
    process.exit(1);
  }
}

testUnifiedDB();