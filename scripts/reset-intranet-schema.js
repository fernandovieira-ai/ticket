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
const dbMain = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

async function resetSchema() {
  try {
    console.log("🗑️ Removendo schema intranet existente...");

    await dbMain.query(`DROP SCHEMA IF EXISTS intranet CASCADE`);

    console.log("✅ Schema intranet removido com sucesso!");

  } catch (error) {
    console.error("❌ Erro ao remover schema:", error);
    process.exit(1);
  } finally {
    await dbMain.end();
    console.log("🔌 Conexão fechada");
  }
}

resetSchema();