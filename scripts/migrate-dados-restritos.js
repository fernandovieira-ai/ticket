/**
 * migrate-dados-restritos.js
 * Migra drfintra.tab_restrito (drfweb) → intranet.dados_restrito (drfticket)
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

const dbDest = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("railway") ? { rejectUnauthorized: false } : false,
});

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

  // Garantir tabela destino
  await dbDest.query(`
    CREATE TABLE IF NOT EXISTS intranet.dados_restrito (
      id SERIAL,
      des_projeto VARCHAR(30),
      des_funcao VARCHAR(100),
      des_complemento VARCHAR(100),
      des_link VARCHAR(100),
      criado_em TIMESTAMP DEFAULT now(),
      CONSTRAINT dados_restritos_pkey PRIMARY KEY (id)
    )
  `);
  console.log("✅ Tabela intranet.dados_restrito garantida\n");

  // Ler origem
  const { rows } = await dbSrc.query(
    "SELECT id, des_projeto, des_funcao, des_complemento, des_link FROM drfintra.tab_restrito ORDER BY id"
  );
  console.log(`📋 ${rows.length} registros encontrados na origem\n`);

  if (rows.length === 0) {
    console.log("⚠️  Nenhum dado encontrado na origem.");
    return;
  }

  // Amostra
  console.log("Amostra (primeiros 3):");
  rows.slice(0, 3).forEach(r => console.log(`  • [${r.id}] ${r.des_projeto} | ${r.des_funcao}`));
  console.log();

  // Migrar com OVERRIDING SYSTEM VALUE para preservar IDs
  let inseridos = 0;
  let atualizados = 0;
  let erros = 0;

  for (const r of rows) {
    try {
      const res = await dbDest.query(
        `INSERT INTO intranet.dados_restrito (id, des_projeto, des_funcao, des_complemento, des_link)
         OVERRIDING SYSTEM VALUE
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           des_projeto     = EXCLUDED.des_projeto,
           des_funcao      = EXCLUDED.des_funcao,
           des_complemento = EXCLUDED.des_complemento,
           des_link        = EXCLUDED.des_link
         RETURNING (xmax = 0) AS inserted`,
        [r.id, r.des_projeto, r.des_funcao, r.des_complemento, r.des_link]
      );
      if (res.rows[0]?.inserted) inseridos++;
      else atualizados++;
    } catch (e) {
      console.error(`  ❌ Erro no registro ${r.id}:`, e.message);
      erros++;
    }
  }

  // Ajustar sequência
  await dbDest.query(
    `SELECT setval(pg_get_serial_sequence('intranet.dados_restrito', 'id'), (SELECT MAX(id) FROM intranet.dados_restrito))`
  );

  console.log(`✅ Migração concluída:`);
  console.log(`   Inseridos  : ${inseridos}`);
  console.log(`   Atualizados: ${atualizados}`);
  console.log(`   Erros      : ${erros}`);

  const { rows: total } = await dbDest.query("SELECT count(*) FROM intranet.dados_restrito");
  console.log(`\n📊 Total em intranet.dados_restrito: ${total[0].count} registros`);
}

migrate()
  .catch(e => { console.error("❌ Falha:", e.message); process.exit(1); })
  .finally(() => { dbSrc.end(); dbDest.end(); });
