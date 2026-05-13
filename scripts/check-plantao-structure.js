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

// Pool da intranet
const dbIntranet = new Pool({
  host: process.env.INTRANET_DB_HOST,
  database: process.env.INTRANET_DB_NAME,
  user: process.env.INTRANET_DB_USER,
  password: process.env.INTRANET_DB_PASS,
  port: parseInt(process.env.INTRANET_DB_PORT || "5432"),
  ssl: false,
});

async function checkStructure() {
  try {
    // Verificar estrutura da tabela plantão
    const columnsResult = await dbIntranet.query(`
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default
      FROM information_schema.columns
      WHERE table_schema = 'drfintra' AND table_name = 'tab_plantao'
      ORDER BY ordinal_position
    `);

    console.log("📋 Estrutura da tabela drfintra.tab_plantao:");
    for (const col of columnsResult.rows) {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === "YES" ? "NULL" : "NOT NULL"}`);
    }

    // Ver sample dos dados
    const sampleResult = await dbIntranet.query(`
      SELECT * FROM drfintra.tab_plantao LIMIT 3
    `);

    console.log("\n📄 Sample dos dados:");
    console.log(JSON.stringify(sampleResult.rows, null, 2));

  } catch (error) {
    console.error("❌ Erro:", error);
  } finally {
    await dbIntranet.end();
  }
}

checkStructure();