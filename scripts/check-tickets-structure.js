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

async function checkTicketsStructure() {
  try {
    console.log("🔍 Verificando estrutura das tabelas relevantes...\n");

    const { Pool } = require("pg");
    const db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    // Verificar estrutura da tabela tickets
    console.log("📋 Estrutura da tabela 'tickets':");
    const ticketsColumns = await db.query(`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'tickets' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    for (const col of ticketsColumns.rows) {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === "YES" ? "NULL" : "NOT NULL"}`);
    }

    // Verificar estrutura da tabela ticket_status
    console.log("\n📋 Estrutura da tabela 'ticket_status':");
    const statusColumns = await db.query(`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ticket_status' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    for (const col of statusColumns.rows) {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === "YES" ? "NULL" : "NOT NULL"}`);
    }

    // Sample de dados da tabela tickets
    console.log("\n📄 Sample da tabela tickets (primeiras 2 linhas):");
    const ticketsSample = await db.query(`SELECT * FROM tickets LIMIT 2`);
    console.log(JSON.stringify(ticketsSample.rows, null, 2));

    // Sample de dados da tabela ticket_status
    console.log("\n📄 Sample da tabela ticket_status:");
    const statusSample = await db.query(`SELECT * FROM ticket_status`);
    console.log(JSON.stringify(statusSample.rows, null, 2));

    // Verificar estrutura da tabela usuarios
    console.log("\n📋 Estrutura da tabela 'usuarios':");
    const usuariosColumns = await db.query(`
      SELECT
        column_name,
        data_type,
        is_nullable
      FROM information_schema.columns
      WHERE table_name = 'usuarios' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);

    for (const col of usuariosColumns.rows) {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === "YES" ? "NULL" : "NOT NULL"}`);
    }

    await db.end();
    console.log("\n✅ Verificação concluída!");

  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

checkTicketsStructure();