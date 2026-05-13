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

// Pool da intranet (fonte)
const dbIntranet = new Pool({
  host: process.env.INTRANET_DB_HOST,
  database: process.env.INTRANET_DB_NAME,
  user: process.env.INTRANET_DB_USER,
  password: process.env.INTRANET_DB_PASS,
  port: parseInt(process.env.INTRANET_DB_PORT || "5432"),
  ssl: false,
});

async function createIntranetSchema() {
  console.log("📋 Criando schema intranet no banco principal...");

  try {
    // Criar schema intranet se não existir
    await dbMain.query(`CREATE SCHEMA IF NOT EXISTS intranet`);

    // Criar tabelas da intranet no banco principal

    // 1. Informativos
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.informativos (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descricao TEXT NOT NULL,
        dta_validade DATE,
        criado_em TIMESTAMP DEFAULT now(),
        atualizado_em TIMESTAMP DEFAULT now()
      )
    `);

    // 2. Plantão
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.plantao (
        id SERIAL PRIMARY KEY,
        dtainicio DATE,
        dtafinal DATE,
        analista VARCHAR(100),
        dia_semana VARCHAR(20),
        observacao TEXT,
        ind_finalizado CHAR(1) DEFAULT 'N',
        criado_em TIMESTAMP DEFAULT now()
      )
    `);

    // 3. FAQ
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.faq (
        id SERIAL PRIMARY KEY,
        nom_sistema VARCHAR(100),
        des_assunto TEXT,
        des_erro TEXT,
        des_resolucao TEXT,
        imagem BYTEA,
        tipo_arquivo VARCHAR(50),
        caminho_arquivo VARCHAR(500),
        usuario_cadastro VARCHAR(100),
        criado_em TIMESTAMP DEFAULT now()
      )
    `);

    // 4. Sistemas (para FAQ)
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.sistemas (
        id SERIAL PRIMARY KEY,
        nom_sistema VARCHAR(100) NOT NULL UNIQUE
      )
    `);

    // 5. Mensagens/Recados
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.mensagens (
        id SERIAL PRIMARY KEY,
        usuario_id UUID REFERENCES usuarios(id),
        username VARCHAR(100),
        mensagem TEXT NOT NULL,
        imagem BYTEA,
        tipo_imagem VARCHAR(50),
        criado_em TIMESTAMP DEFAULT now(),
        atualizado_em TIMESTAMP DEFAULT now()
      )
    `);

    // 6. Contratos
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.contratos (
        id SERIAL PRIMARY KEY,
        grupo_empresa VARCHAR(100),
        empresa VARCHAR(200),
        cnpj VARCHAR(20),
        contato VARCHAR(100),
        telefone VARCHAR(20),
        email VARCHAR(100),
        observacoes TEXT,
        senha_criptografada TEXT,
        criado_em TIMESTAMP DEFAULT now()
      )
    `);

    // 7. Dados Restritos
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.dados_restritos (
        id SERIAL PRIMARY KEY,
        projeto VARCHAR(100),
        descricao TEXT,
        dados_criptografados TEXT,
        criado_por VARCHAR(100),
        criado_em TIMESTAMP DEFAULT now()
      )
    `);

    // 8. AnyDesk Acessos
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.anydesk_acessos (
        id SERIAL PRIMARY KEY,
        rede VARCHAR(100),
        unidade VARCHAR(200),
        host VARCHAR(100),
        end_anydesk VARCHAR(50),
        senha_anydesk VARCHAR(100),
        criado_em TIMESTAMP DEFAULT now()
      )
    `);

    // 9. DTEF
    await dbMain.query(`
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

    // 10. TRMM
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.trmm (
        id SERIAL PRIMARY KEY,
        dados JSONB,
        criado_em TIMESTAMP DEFAULT now()
      )
    `);

    // 11. Config
    await dbMain.query(`
      CREATE TABLE IF NOT EXISTS intranet.config (
        chave VARCHAR(100) PRIMARY KEY,
        valor TEXT,
        atualizado_em TIMESTAMP DEFAULT now()
      )
    `);

    console.log("✅ Schema intranet criado com sucesso!");

  } catch (error) {
    console.error("❌ Erro ao criar schema:", error);
    throw error;
  }
}

async function migrateData() {
  console.log("🔄 Iniciando migração de dados...\n");

  try {
    // 1. Migrar Informativos
    console.log("📰 Migrando informativos...");
    const informativos = await dbIntranet.query(`
      SELECT * FROM drfintra.informativos ORDER BY id
    `);

    for (const info of informativos.rows) {
      await dbMain.query(`
        INSERT INTO intranet.informativos (titulo, descricao, dta_validade)
        VALUES ($1, $2, $3)
        ON CONFLICT DO NOTHING
      `, [info.titulo, info.descricao, info.dta_validade]);
    }
    console.log(`✅ ${informativos.rows.length} informativos migrados`);

    // 2. Migrar Plantão
    console.log("📅 Migrando plantão...");
    const plantao = await dbIntranet.query(`
      SELECT * FROM drfintra.tab_plantao ORDER BY dtainicio
    `);

    for (const p of plantao.rows) {
      await dbMain.query(`
        INSERT INTO intranet.plantao (dtainicio, dtafinal, analista, dia_semana, observacao, ind_finalizado)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT DO NOTHING
      `, [p.dtainicio, p.dtafinal, p.analista, p.dia_semana, p.observacao, p.ind_finalizado || 'N']);
    }
    console.log(`✅ ${plantao.rows.length} registros de plantão migrados`);

    // 3. Migrar Sistemas (para FAQ)
    console.log("🔧 Migrando sistemas...");
    const sistemas = await dbIntranet.query(`
      SELECT * FROM drfintra.tab_sistema ORDER BY id
    `);

    for (const s of sistemas.rows) {
      await dbMain.query(`
        INSERT INTO intranet.sistemas (nom_sistema)
        VALUES ($1)
        ON CONFLICT (nom_sistema) DO NOTHING
      `, [s.nom_sistema]);
    }
    console.log(`✅ ${sistemas.rows.length} sistemas migrados`);

    // 4. Migrar FAQ
    console.log("❓ Migrando FAQ...");
    const faq = await dbIntranet.query(`
      SELECT * FROM drfintra.tab_faq ORDER BY id
    `);

    for (const f of faq.rows) {
      await dbMain.query(`
        INSERT INTO intranet.faq
        (nom_sistema, des_assunto, des_erro, des_resolucao, imagem, tipo_arquivo, caminho_arquivo, usuario_cadastro)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        f.nom_sistema, f.des_assunto, f.des_erro, f.des_resolucao,
        f.imagem, f.tipo_arquivo, f.caminho_arquivo, f.usuario_cadastro
      ]);
    }
    console.log(`✅ ${faq.rows.length} itens de FAQ migrados`);

    // 5. Migrar AnyDesk
    console.log("💻 Migrando acessos AnyDesk...");
    const anydesk = await dbIntranet.query(`
      SELECT * FROM drfintra.anydesk_acessos
    `);

    for (const a of anydesk.rows) {
      await dbMain.query(`
        INSERT INTO intranet.anydesk_acessos (rede, unidade, host, end_anydesk, senha_anydesk)
        VALUES ($1, $2, $3, $4, $5)
      `, [a.rede, a.unidade, a.host, a.end_anydesk, a.senhadesk]);
    }
    console.log(`✅ ${anydesk.rows.length} acessos AnyDesk migrados`);

    // 6. Migrar DTEF
    console.log("🔐 Migrando senhas DTEF...");
    const dtef = await dbIntranet.query(`
      SELECT * FROM drfintra.intra_dtef
    `);

    for (const d of dtef.rows) {
      await dbMain.query(`
        INSERT INTO intranet.dtef (cnpj, loja, senha, observacoes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (cnpj) DO UPDATE SET
        loja = EXCLUDED.loja,
        senha = EXCLUDED.senha,
        observacoes = EXCLUDED.observacoes,
        atualizado_em = now()
      `, [d.cnpj, d.loja, d.senha, d.observacoes]);
    }
    console.log(`✅ ${dtef.rows.length} senhas DTEF migradas`);

    // 7. Migrar Config
    console.log("⚙️ Migrando configurações...");
    const config = await dbIntranet.query(`
      SELECT * FROM drfintra.config
    `);

    for (const c of config.rows) {
      await dbMain.query(`
        INSERT INTO intranet.config (chave, valor, atualizado_em)
        VALUES ($1, $2, $3)
        ON CONFLICT (chave) DO UPDATE SET
        valor = EXCLUDED.valor,
        atualizado_em = EXCLUDED.atualizado_em
      `, [c.chave, c.valor, c.atualizado_em]);
    }
    console.log(`✅ ${config.rows.length} configurações migradas`);

    // 8. Migrar Contratos
    console.log("📋 Migrando contratos...");
    const contratos = await dbIntranet.query(`
      SELECT * FROM drfintra.tab_contrato
    `);

    for (const cont of contratos.rows) {
      await dbMain.query(`
        INSERT INTO intranet.contratos
        (grupo_empresa, empresa, cnpj, contato, telefone, email, observacoes, senha_criptografada)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        cont.grupo_empresa, cont.empresa, cont.cnpj,
        cont.contato, cont.telefone, cont.email,
        cont.observacoes, cont.senha
      ]);
    }
    console.log(`✅ ${contratos.rows.length} contratos migrados`);

    // 9. Migrar Dados Restritos
    console.log("🔒 Migrando dados restritos...");
    const restritos = await dbIntranet.query(`
      SELECT * FROM drfintra.tab_restrito
    `);

    for (const r of restritos.rows) {
      await dbMain.query(`
        INSERT INTO intranet.dados_restritos (projeto, descricao, dados_criptografados, criado_por)
        VALUES ($1, $2, $3, $4)
      `, [r.projeto, r.descricao, r.dados, r.criado_por]);
    }
    console.log(`✅ ${restritos.rows.length} dados restritos migrados`);

  } catch (error) {
    console.error("❌ Erro durante migração:", error);
    throw error;
  }
}

async function migrate() {
  try {
    console.log("🚀 Iniciando migração da Intranet para drfticket...\n");

    // Testar conexões
    console.log("🔗 Testando conexões...");
    await dbMain.query("SELECT 1");
    console.log("✅ Conectado ao banco principal (drfticket)");

    await dbIntranet.query("SELECT 1");
    console.log("✅ Conectado ao banco da intranet (drfweb)");

    // Criar schema
    await createIntranetSchema();

    // Migrar dados
    await migrateData();

    console.log("\n🎉 Migração concluída com sucesso!");
    console.log("📊 Resumo:");
    console.log("  ✓ Schema 'intranet' criado em drfticket");
    console.log("  ✓ Todas as tabelas da intranet migradas");
    console.log("  ✓ Dados preservados e organizados");

  } catch (error) {
    console.error("💥 Falha na migração:", error);
    process.exit(1);
  } finally {
    await dbMain.end();
    await dbIntranet.end();
    console.log("🔌 Conexões fechadas");
  }
}

// Executar migração
migrate();