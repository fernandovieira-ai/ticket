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

async function checkUsuarios() {
  try {
    console.log("🧪 Verificando estrutura da tabela usuários...\n");

    const { Pool } = require("pg");
    const db = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
    });

    // Verificar estrutura da tabela usuários
    console.log("📊 Estrutura da tabela usuários:");
    const tableInfo = await db.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'usuarios'
      ORDER BY ordinal_position
    `);

    tableInfo.rows.forEach(col => {
      console.log(`  • ${col.column_name} (${col.data_type})`);
    });

    // Verificar perfis disponíveis
    console.log("\n📋 Perfis dos usuários:");
    const perfis = await db.query(`
      SELECT DISTINCT perfil, count(*) as quantidade
      FROM usuarios
      WHERE ativo = true
      GROUP BY perfil
      ORDER BY perfil
    `);

    perfis.rows.forEach(p => {
      console.log(`  • ${p.perfil}: ${p.quantidade} usuários`);
    });

    // Buscar usuários atendentes (operadores e supervisores)
    console.log("\n👥 Usuários atendentes (operadores e supervisores):");
    const atendentes = await db.query(`
      SELECT nome, email, perfil
      FROM usuarios
      WHERE ativo = true AND perfil IN ('operador', 'supervisor')
      ORDER BY nome
    `);

    if (atendentes.rows.length > 0) {
      atendentes.rows.forEach(user => {
        console.log(`  • ${user.nome} (${user.email}) - ${user.perfil}`);
      });
    } else {
      console.log("  Nenhum atendente encontrado");

      // Mostrar alguns usuários para referência
      console.log("\n📋 Alguns usuários do sistema:");
      const usuarios = await db.query(`
        SELECT nome, email, perfil
        FROM usuarios
        WHERE ativo = true
        ORDER BY nome
        LIMIT 5
      `);

      usuarios.rows.forEach(user => {
        console.log(`  • ${user.nome} (${user.email}) - ${user.perfil}`);
      });
    }

    await db.end();

  } catch (error) {
    console.error("❌ Erro:", error);
  }
}

checkUsuarios();