/**
 * migrate-dtef.js
 * Migra drfintra.intra_dtef (drfweb) → intranet.dtef (drfticket)
 */
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Carregar .env.local
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

// Pool destino (drfticket — DATABASE_URL)
const dbDest = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
});

// Pool origem (drfweb)
const dbSrc = new Pool({
  host: "cloud.digitalrf.com.br",
  database: "drfweb",
  user: "drfweb",
  password: "ASf5S6g7d6d0s",
  port: 5432,
  ssl: false,
});

async function migrate() {
  console.log("🔗 Conectando...");
  await dbSrc.query("SELECT 1");
  console.log("✅ drfweb OK");
  await dbDest.query("SELECT 1");
  console.log("✅ drfticket OK\n");

  // Garantir tabela no destino
  await dbDest.query(`
    CREATE TABLE IF NOT EXISTS intranet.dtef (
      id SERIAL PRIMARY KEY,
      cnpj VARCHAR(20) UNIQUE NOT NULL,
      loja VARCHAR(100),
      senha VARCHAR(100),
      observacoes TEXT,
      criado_em TIMESTAMP DEFAULT now(),
      atualizado_em TIMESTAMP DEFAULT now()
    )
  `);
  console.log("✅ Tabela intranet.dtef garantida\n");

  // Ler origem
  console.log("🔐 Lendo drfintra.intra_dtef...");
  const { rows } = await dbSrc.query("SELECT * FROM drfintra.intra_dtef ORDER BY loja");
  console.log(`   ${rows.length} registros encontrados\n`);

  if (rows.length === 0) {
    console.log("⚠️  Nenhum dado encontrado na origem.");
    return;
  }

  // Mostrar amostra
  console.log("Amostra (primeiros 3):");
  rows.slice(0, 3).forEach(r => console.log(`  • ${r.loja} | ${r.cnpj}`));
  console.log();

  // Migrar
  let inseridos = 0;
  let atualizados = 0;
  let erros = 0;

  for (const d of rows) {
    try {
      const res = await dbDest.query(`
        INSERT INTO intranet.dtef (cnpj, loja, senha, observacoes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (cnpj) DO UPDATE SET
          loja = EXCLUDED.loja,
          senha = EXCLUDED.senha,
          observacoes = EXCLUDED.observacoes,
          atualizado_em = now()
        RETURNING (xmax = 0) AS inserted
      `, [d.cnpj, d.loja, d.pass ?? d.senha ?? null, d.observacoes ?? null]);

      if (res.rows[0]?.inserted) inseridos++;
      else atualizados++;
    } catch (e) {
      console.error(`  ❌ Erro no registro ${d.cnpj}:`, e.message);
      erros++;
    }
  }

  console.log(`\n✅ Migração concluída:`);
  console.log(`   Inseridos : ${inseridos}`);
  console.log(`   Atualizados: ${atualizados}`);
  console.log(`   Erros     : ${erros}`);

  // Verificar destino
  const { rows: total } = await dbDest.query("SELECT count(*) FROM intranet.dtef");
  console.log(`\n📊 Total em intranet.dtef: ${total[0].count} registros`);
}

migrate()
  .catch(e => { console.error("❌ Falha:", e.message); process.exit(1); })
  .finally(() => { dbSrc.end(); dbDest.end(); });
