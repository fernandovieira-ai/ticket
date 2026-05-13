// Baixa imagens FAQ diretamente do app em produção, sem precisar de deploy.
//
// Uso:
//   node scripts/download-faq-images.js <SESSION_TOKEN>
//
// Como pegar o SESSION_TOKEN:
//   1. Abra https://painel.digitalrf.com.br no navegador e faça login
//   2. F12 > Application > Cookies > copie o valor de "next-auth.session-token"

const https = require("https");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const BASE_URL = "https://painel.digitalrf.com.br";
const DB_URL = "postgresql://drfticket:jIs%4096e8Ui@cloud.digitalrf.com.br:5433/drfticket";

const [, , cookie] = process.argv;

if (!cookie) {
  console.error("Uso: node scripts/download-faq-images.js <SESSION_TOKEN>");
  console.error("Pegue o token em: painel.digitalrf.com.br > F12 > Application > Cookies > next-auth.session-token");
  process.exit(1);
}

const destDir = path.join(__dirname, "..", "public", "uploads", "faq");
fs.mkdirSync(destDir, { recursive: true });

function downloadFile(id) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}/api/intranet/faq/${id}/imagem`;
    https.get(url, { headers: { cookie: `next-auth.session-token=${cookie}` } }, (res) => {
      if (res.statusCode === 404) { resolve(null); return; }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} para id=${id}`)); return; }

      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const contentType = res.headers["content-type"] ?? "image/jpeg";
        const ext = contentType.includes("pdf") ? ".pdf"
          : contentType.includes("png") ? ".png"
          : contentType.includes("gif") ? ".gif"
          : contentType.includes("webp") ? ".webp"
          : ".jpg";
        resolve({ data: Buffer.concat(chunks), ext, contentType });
      });
    }).on("error", reject);
  });
}

(async () => {
  const pool = new Pool({ connectionString: DB_URL, ssl: false });
  const { rows } = await pool.query(
    "SELECT id, caminho_arquivo FROM intranet.faq WHERE caminho_arquivo IS NOT NULL ORDER BY id"
  );
  await pool.end();

  console.log(`${rows.length} registro(s) com caminho_arquivo no DB`);

  for (const row of rows) {
    const filename = row.caminho_arquivo.split("/").pop();
    const destPath = path.join(destDir, filename);

    if (fs.existsSync(destPath)) {
      console.log(`  ⏭  já existe: ${filename}`);
      continue;
    }

    try {
      const result = await downloadFile(row.id);
      if (!result) { console.log(`  ✗ 404: id=${row.id}`); continue; }
      fs.writeFileSync(destPath, result.data);
      console.log(`  ✓ ${filename} (${result.data.length} bytes)`);
    } catch (e) {
      console.error(`  ✗ Erro id=${row.id}: ${e.message}`);
    }
  }

  console.log(`\nConcluído. Arquivos em: ${destDir}`);
})();
