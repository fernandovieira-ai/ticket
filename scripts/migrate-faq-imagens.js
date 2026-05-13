/**
 * migrate-faq-imagens.js
 *
 * Extrai imagens bytea da coluna intranet.faq.imagem e salva como arquivos
 * no mesmo diretório que os anexos de tickets no Railway.
 *
 * Uso local:
 *   node scripts/migrate-faq-imagens.js
 *
 * Uso no Railway (via railway run):
 *   railway run node scripts/migrate-faq-imagens.js
 */

require("dotenv").config({ path: ".env.local" });

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : undefined,
});

const MIME_EXT = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};

const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "intranet", "faq")
  : path.join(process.cwd(), "public", "uploads", "intranet", "faq");

async function run() {
  fs.mkdirSync(dir, { recursive: true });
  console.log(`📁 Diretório destino: ${dir}`);

  const { rows } = await pool.query(
    `SELECT id, imagem, tipo_arquivo
     FROM intranet.faq
     WHERE imagem IS NOT NULL AND caminho_arquivo IS NULL`
  );

  console.log(`🔍 ${rows.length} FAQ(s) com imagem bytea para migrar`);

  let ok = 0, fail = 0;

  for (const row of rows) {
    try {
      const mime = row.tipo_arquivo || "image/jpeg";
      const ext = MIME_EXT[mime] || ".jpg";
      const filename = `${randomUUID()}${ext}`;
      const filePath = path.join(dir, filename);

      fs.writeFileSync(filePath, row.imagem);

      await pool.query(
        `UPDATE intranet.faq
         SET caminho_arquivo = $1, imagem = NULL
         WHERE id = $2`,
        [filePath, row.id]
      );

      console.log(`  ✅ FAQ #${row.id} → ${filename}`);
      ok++;
    } catch (err) {
      console.error(`  ❌ FAQ #${row.id}: ${err.message}`);
      fail++;
    }
  }

  console.log(`\n✅ Migrados: ${ok} | ❌ Erros: ${fail}`);
  await pool.end();
}

run().catch((err) => {
  console.error("Erro fatal:", err.message);
  process.exit(1);
});
