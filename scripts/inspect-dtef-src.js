const { Pool } = require("pg");
const src = new Pool({
  host: "cloud.digitalrf.com.br",
  database: "drfweb",
  user: "drfweb",
  password: "ASf5S6g7d6d0s",
  port: 5432,
  ssl: false,
});
async function run() {
  const cols = await src.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema = 'drfintra' AND table_name = 'intra_dtef' ORDER BY ordinal_position"
  );
  console.log("Colunas:", cols.rows.map(c => c.column_name).join(", "));
  const rows = await src.query("SELECT * FROM drfintra.intra_dtef LIMIT 3");
  console.log("Amostra:", JSON.stringify(rows.rows, null, 2));
  src.end();
}
run().catch(e => { console.error(e.message); src.end(); });
