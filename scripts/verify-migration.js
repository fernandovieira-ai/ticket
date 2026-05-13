const { Pool } = require("pg");
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

// Pool principal (drfticket)
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function verifyMigration() {
  try {
    console.log("🔍 Verificando migração do schema intranet...\n");

    // 1. Verificar se o schema existe
    const schemaResult = await db.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name = 'intranet'
    `);

    if (schemaResult.rows.length === 0) {
      throw new Error("Schema 'intranet' não encontrado!");
    }
    console.log("✅ Schema 'intranet' existe");

    // 2. Listar todas as tabelas do schema intranet
    const tablesResult = await db.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'intranet'
      ORDER BY table_name
    `);

    console.log("\n📋 Tabelas migradas:");
    let totalRecords = 0;
    for (const table of tablesResult.rows) {
      // Contar registros de cada tabela individualmente
      const countResult = await db.query(`SELECT count(*) FROM intranet.${table.table_name}`);
      const count = parseInt(countResult.rows[0].count);
      console.log(`  ${table.table_name}: ${count} registros`);
      totalRecords += count;
    }
    console.log(`\n📊 Total de registros migrados: ${totalRecords}`);

    // 3. Testar consultas em algumas tabelas específicas
    console.log("\n🧪 Testando consultas...");

    // Informativos
    const informativos = await db.query(`
      SELECT titulo FROM intranet.informativos LIMIT 2
    `);
    console.log(`✅ Informativos: ${informativos.rows.map(r => r.titulo).join(', ')}`);

    // Plantão
    const plantao = await db.query(`
      SELECT analista, dtainicio FROM intranet.plantao
      ORDER BY dtainicio DESC LIMIT 2
    `);
    console.log(`✅ Plantão: ${plantao.rows.map(r => `${r.analista} (${r.dtainicio})`).join(', ')}`);

    // FAQ
    const faq = await db.query(`
      SELECT nom_sistema, des_assunto FROM intranet.faq LIMIT 2
    `);
    console.log(`✅ FAQ: ${faq.rows.map(r => `${r.nom_sistema} - ${r.des_assunto.substring(0, 30)}...`).join(', ')}`);

    // DTEF
    const dtef = await db.query(`
      SELECT loja FROM intranet.dtef LIMIT 3
    `);
    console.log(`✅ DTEF: ${dtef.rows.map(r => r.loja).join(', ')}`);

    console.log("\n🎉 Migração verificada com sucesso!");
    console.log("🔗 Agora o banco drfticket contém:");
    console.log("  • Schema 'public' (DigitalRF-Help)");
    console.log("  • Schema 'intranet' (dados da Intranet)");

  } catch (error) {
    console.error("❌ Erro na verificação:", error);
    process.exit(1);
  } finally {
    await db.end();
    console.log("🔌 Conexão fechada");
  }
}

verifyMigration();