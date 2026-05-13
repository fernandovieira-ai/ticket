import { query } from "@/lib/db-unified";

async function analyzeIntranetSchema() {
  console.log("📋 Analisando estrutura do banco da Intranet...\n");

  try {
    // Listar todas as tabelas do schema drfintra
    const tablesResult = await query(`
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
      const countResult = await query(`
        SELECT COUNT(*) as count FROM drfintra.${tableName}
      `);
      console.log(`📊 Registros: ${countResult.rows[0].count}`);

      // Estrutura das colunas
      const columnsResult = await query(`
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
          const sampleResult = await query(`
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