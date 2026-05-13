// Após rodar: railway run node scripts/export-faq-stdout.js > faq-export.json
// Execute: node scripts/import-faq-images.js
const fs = require("fs");
const path = require("path");

const srcFile = path.join(__dirname, "..", "faq-export.json");
if (!fs.existsSync(srcFile)) {
  console.error("Arquivo faq-export.json não encontrado. Rode primeiro o export no Railway.");
  process.exit(1);
}

const { total, files } = JSON.parse(fs.readFileSync(srcFile, "utf-8"));
const destDir = path.join(__dirname, "..", "public", "uploads", "faq");
fs.mkdirSync(destDir, { recursive: true });

console.log(`Importando ${total} arquivo(s)...`);
for (const file of files) {
  const dest = path.join(destDir, file.name);
  fs.writeFileSync(dest, Buffer.from(file.base64, "base64"));
  console.log(`  ✓ ${file.name}`);
}
console.log(`\nImagens salvas em: ${destDir}`);
