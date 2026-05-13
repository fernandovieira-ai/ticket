// Roda no ambiente Railway: railway run node scripts/export-faq-stdout.js > faq-export.json
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const dir = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "uploads", "intranet", "faq")
  : path.join(process.cwd(), "public", "uploads", "intranet", "faq");

(async () => {
  const { rows } = await pool.query(
    "SELECT id, caminho_arquivo, tipo_arquivo FROM intranet.faq WHERE caminho_arquivo IS NOT NULL"
  );

  const files = [];
  for (const row of rows) {
    const filename = row.caminho_arquivo.includes("/")
      ? row.caminho_arquivo.split("/").pop()
      : row.caminho_arquivo;
    const fullPath = path.join(dir, filename);
    try {
      const data = fs.readFileSync(fullPath);
      files.push({ name: filename, mime: row.tipo_arquivo ?? "image/jpeg", base64: data.toString("base64") });
    } catch {
      // ignora arquivos não encontrados
    }
  }

  process.stdout.write(JSON.stringify({ total: files.length, files }));
  await pool.end();
})();
