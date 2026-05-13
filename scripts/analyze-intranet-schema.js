const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Carregar .env.local manualmente
const envPath = path.join(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split("\n").forEach(line => {
    const [key, ...value] = line.split("=");
    if (key && value.length > 0) {
      process.env[key.trim()] = value.join("=").trim();
    }
  });
}

// Pool temporário para ler da intranet
const dbIntranetSource = new Pool({
  host: process.env.INTRANET_DB_HOST,
  database: process.env.INTRANET_DB_NAME,
  user: process.env.INTRANET_DB_USER,
  password: process.env.INTRANET_DB_PASS,
  port: parseInt(process.env.INTRANET_DB_PORT || "5432"),
  ssl: false,
});

async function queryIntranetSource(text, params) {
  try {
    const result = await dbIntranetSource.query(text, params);
    return result;
  } catch (error) {
    console.error("❌ Erro na query da intranet:", error);
    throw error;
  }
}

async function analyzeIntranetSchema() {
  console.log("📋 Analisando estrutura do banco da Intranet...\n");

  try {
    // Listar todas as tabelas do schema drfintra
    const tablesResult = await queryIntranetSource(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'drfintra'
      ORDER BY table_name
    `);

    console.log("📋 Tabelas encontradas no schema drfintra:");
    for (const row of tablesResult.rows) {
      console.log(`  - ${row.table_name}`);
    }

    console.log("\n🔍 Analisando estrutura de cada tabela:\n");

    for (const table of tablesResult.rows) {
      const tableName = table.table_name;

      console.log(`\n📋 Tabela: drfintra.${tableName}`);
      console.log("=" .repeat(50));

      // Contar registros
      const countResult = await queryIntranetSource(`
        SELECT COUNT(*) as count FROM drfintra.${tableName}
      `);
      console.log(`📊 Registros: ${countResult.rows[0].count}`);

      // Estrutura das colunas
      const columnsResult = await queryIntranetSource(`
        SELECT
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'drfintra' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      console.log("\n📋 Colunas:");
      for (const col of columnsResult.rows) {
        const nullable = col.is_nullable === "YES" ? "NULL" : "NOT NULL";
        const length = col.character_maximum_length ? `(${col.character_maximum_length})` : "";
        const defaultVal = col.column_default ? ` DEFAULT ${col.column_default}` : "";

        console.log(`  ${col.column_name}: ${col.data_type}${length} ${nullable}${defaultVal}`);
      }

      // Sample de dados se tiver registros
      if (countResult.rows[0].count > 0) {
        try {
          const sampleResult = await queryIntranetSource(`
            SELECT * FROM drfintra.${tableName} LIMIT 2
          `);

          console.log("\n📄 Sample (2 primeiros registros):");
          console.log(JSON.stringify(sampleResult.rows, null, 2));
        } catch (error) {
          console.log("⚠️  Erro ao buscar sample:", error);
        }
      }
    }

  } catch (error) {
    console.error("❌ Erro ao analisar schema:", error);
  } finally {
    await dbIntranetSource.end();
  }
}

// Executar análise
analyzeIntranetSchema().then(() => {
  console.log("\n✅ Análise completa!");
  process.exit(0);
}).catch(error => {
  console.error("❌ Erro:", error);
  process.exit(1);
});